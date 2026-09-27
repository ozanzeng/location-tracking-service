import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Queue, type JobType } from 'bullmq';
import { Redis } from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { laneOf, laneQueueName } from './lanes.js';
import {
  LEGACY_LOCATION_QUEUE,
  LOCATION_JOB,
  type LocationJobData,
} from './location-job.js';

/** İncelemek için Redis'te tutulan en fazla iş: tüm şeritlerin toplamı. */
export const KEEP_COMPLETED = 1000;
export const KEEP_FAILED = 5000;

/**
 * Kuyruğa eklenen işlerin ayarları. Tutma sınırları kuyruk başınadır; şeritlere bölünür,
 * yoksa 64 şerit Redis'te 64 kat iş biriktirirdi.
 */
export function laneJobOptions(queues: number) {
  return {
    // Yeniden deneme worker'ın içinde yapılır (LocationProcessor): BullMQ'nun kendi denemesi
    // işi şeridin sonuna atar ve aynı kullanıcının sonraki işi öne geçerdi.
    attempts: 1,
    // Tamamlanan işleri Redis'te biriktirme; yük altında belleği korur.
    removeOnComplete: {
      count: Math.ceil(KEEP_COMPLETED / queues),
      age: 3600,
    },
    removeOnFail: { count: Math.ceil(KEEP_FAILED / queues) },
  };
}

/**
 * Kurulu şerit sayısını ilk açılan süreç yazar; sonrakiler aynı sayıyla açılmalı.
 * KEYS: düzen anahtarı. ARGV: şerit sayısı. Kayıtlı değeri döner.
 */
const LAYOUT_SCRIPT = `
redis.call('SET', KEYS[1], ARGV[1], 'NX')
return redis.call('GET', KEYS[1])
`;

type LanesRedis = Redis & {
  laneLayout(key: string, lanes: number): Promise<string>;
};

/** Şerit sayısı Redis'teki kurulumla uyuşmuyor: bazı şeritler hiç işlenmez ya da sıra bozulur. */
export class LaneLayoutError extends Error {
  constructor(configured: number, stored: string, key: string) {
    super(
      `QUEUE_LANES=${configured}, ama kuyruk ${stored} şeritle kurulmuş. ` +
        "Şerit sayısını değiştirmek için API durdurulur, worker'lar kuyruğu boşaltır, " +
        `"${key}" anahtarı silinir ve tüm süreçler yeni değerle açılır.`,
    );
  }
}

/**
 * Konum kuyruğu, kullanıcılara göre şeritlere bölünmüştür. Her kullanıcı hash(userId) ile
 * hep aynı şeride düşer; şeritte aynı anda tek iş çalışır (BullMQ global concurrency = 1).
 * Böylece aynı kullanıcının işleri geliş sırasıyla, biri bitmeden diğeri başlamadan işlenir;
 * farklı şeritler paralel ilerler. Sıra için ek sayaç, bekletme ya da zaman aşımı gerekmez.
 */
@Injectable()
export class LocationLanes
  implements OnApplicationBootstrap, OnModuleDestroy, OnApplicationShutdown
{
  private readonly logger = new Logger(LocationLanes.name);
  /** Kuyruklar ve worker'lar tek bağlantıyı paylaşır (worker'lar ek olarak bekleme bağlantısı açar). */
  readonly connection: LanesRedis;
  readonly count: number;
  private readonly lanes: Queue<LocationJobData>[];
  private readonly legacy: Queue;
  private readonly layoutKey: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.count = config.queue.lanes;
    this.layoutKey = `${config.queue.prefix}:lanes`;
    // BullMQ worker'ları bloklayan komutlar kullandığı için maxRetriesPerRequest null olmalı.
    const connection = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });
    connection.defineCommand('laneLayout', {
      numberOfKeys: 1,
      lua: LAYOUT_SCRIPT,
    });
    this.connection = connection as LanesRedis;
    const options = {
      connection: this.connection,
      prefix: config.queue.prefix,
      defaultJobOptions: laneJobOptions(this.count),
    };
    this.lanes = Array.from(
      { length: this.count },
      (_, lane) => new Queue<LocationJobData>(laneQueueName(lane), options),
    );
    this.legacy = new Queue(LEGACY_LOCATION_QUEUE, options);
  }

  /**
   * API tarafı: şerit sayısı uyuşmazsa açılışı engellemez (Redis o an erişilemez olabilir),
   * yüksek sesle loglar. Worker aynı kontrolde açılmayı reddeder (LaneWorkers).
   */
  onApplicationBootstrap(): void {
    this.verifyLayout().catch((err: Error) => this.logger.error(err.message));
  }

  /** Kurulu şerit sayısı bu sürecinkiyle aynı değilse LaneLayoutError fırlatır. */
  async verifyLayout(): Promise<void> {
    const stored = await this.connection.laneLayout(this.layoutKey, this.count);
    if (Number(stored) !== this.count) {
      throw new LaneLayoutError(this.count, stored, this.layoutKey);
    }
  }

  /** Worker'lar başlamadan: her şeritte (ve eski kuyrukta) aynı anda tek iş çalışsın. */
  async enforceOneJobPerLane(): Promise<void> {
    await Promise.all(this.queues().map((q) => q.setGlobalConcurrency(1)));
  }

  /** Kullanıcının işini şeridine ekler; dönen kimlik "şerit:iş" biçimindedir. */
  async add(job: LocationJobData): Promise<string> {
    const lane = laneOf(job.userId, this.count);
    const added = await this.lanes[lane].add(LOCATION_JOB, job);
    return `${lane}:${added.id}`;
  }

  /** Toplu ekleme: şerit başına tek çağrı. Kimlikler işlerin sırasıyla döner. */
  async addMany(jobs: LocationJobData[]): Promise<string[]> {
    const byLane = new Map<number, number[]>();
    jobs.forEach((job, i) => {
      const lane = laneOf(job.userId, this.count);
      byLane.set(lane, [...(byLane.get(lane) ?? []), i]);
    });
    const ids: string[] = Array.from({ length: jobs.length });
    await Promise.all(
      [...byLane].map(async ([lane, indexes]) => {
        const added = await this.lanes[lane].addBulk(
          indexes.map((i) => ({ name: LOCATION_JOB, data: jobs[i] })),
        );
        added.forEach((job, k) => (ids[indexes[k]] = `${lane}:${job.id}`));
      }),
    );
    return ids;
  }

  /** Tüm şeritlerdeki (ve eski kuyruktaki) işlerin toplamı. */
  async counts<T extends JobType>(...types: T[]): Promise<Record<T, number>> {
    const perQueue = await Promise.all(
      this.queues().map((q) => q.getJobCounts(...types)),
    );
    const total = Object.fromEntries(types.map((t) => [t, 0])) as Record<
      T,
      number
    >;
    for (const counts of perQueue) {
      for (const type of types) total[type] += counts[type] ?? 0;
    }
    return total;
  }

  /** Şerit başına bekleyen iş sayıları; toplam kuyruk derinliği ve en dolu şerit için. */
  waitingPerLane(): Promise<number[]> {
    return Promise.all(this.queues().map((q) => q.getWaitingCount()));
  }

  /** Worker'ın dinlediği kuyruklar: şeritler ve güncellemeden kalmış eski kuyruk. */
  queues(): Queue[] {
    return [...this.lanes, this.legacy];
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queues().map((q) => q.close()));
  }

  /** Paylaşılan bağlantı en son kapanır: worker'lar kapanırken hâlâ kullanıyor olabilir. */
  async onApplicationShutdown(): Promise<void> {
    await this.connection.quit().catch(() => undefined);
  }
}
