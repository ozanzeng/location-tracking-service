import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type Job, type Processor, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { throttledErrorLogger } from '../common/redis/create-redis.js';
import { LocationLanes } from '../queue/location-lanes.js';
import { LocationProcessor } from './location.processor.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

/**
 * Bir şeridin worker'ı. Aynı anda tek iş: sürecin kendi sınırı (concurrency 1) ve tüm süreçler
 * arasındaki sınır (şeridin global concurrency'si, LocationLanes.enforceOneJobPerLane).
 *
 * Worker işin kilidini lockMs / 2 aralıkla yeniler. Süreç çöker ya da Redis'e ulaşamazsa kilit
 * lockMs sonunda düşer; başka bir worker işi stalledCheckMs aralıklı aramasında bulur ve
 * şeridin önüne geri koyar. İş baştan işlenir; önceden işlenmiş noktalar "eski" sayılıp atlanır.
 */
export function createLaneWorker(
  queueName: string,
  processor: Processor,
  config: AppConfig,
  connection: Redis,
): Worker {
  return new Worker(queueName, processor, {
    connection,
    prefix: config.queue.prefix,
    concurrency: 1,
    lockDuration: config.worker.lockMs,
    stalledInterval: config.worker.stalledCheckMs,
    // BullMQ varsayılanı 1: iki kez takılan iş (ör. makine donması) başarısız sayılıp konum
    // kayboluyordu. Sürekli worker'ı çökerten iş yine de sonunda bırakılır.
    maxStalledCount: config.worker.maxStalledCount,
  });
}

/** Worker sürecinde her şeridi (ve güncellemeden kalan eski kuyruğu) dinler. */
@Injectable()
export class LaneWorkers implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(LaneWorkers.name);
  private workers: Worker[] = [];

  constructor(
    private readonly lanes: LocationLanes,
    private readonly processor: LocationProcessor,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Şerit sayısı uyuşmazsa açılmayı reddet: bazı şeritler hiç dinlenmez ya da aynı
    // kullanıcının işleri iki şeride bölünürdü.
    await this.lanes.verifyLayout();
    // Global sınır worker'lar iş almadan önce kurulmalı.
    await this.lanes.enforceOneJobPerLane();
    const onError = throttledErrorLogger('worker');
    this.workers = this.lanes.queues().map((queue) => {
      const worker = createLaneWorker(
        queue.name,
        (job: Job) => this.processor.process(job),
        this.config,
        this.lanes.connection,
      );
      worker.on('failed', (job, err) => this.processor.onFailed(job, err));
      worker.on('error', onError);
      return worker;
    });
    this.logger.log(`Worker hazır (${this.lanes.count} şerit)`);
  }

  /**
   * Yeni iş alınmaz, çalışan işin bitmesi en fazla WORKER_SHUTDOWN_GRACE_MS beklenir. Veritabanı
   * kapalıyken iş dakikalarca yeniden deneyebilir; o zaman beklemeden kapanılır, işin kilidi
   * düşünce başka bir worker onu şeridin önünden alır (konum kaybolmaz).
   */
  async onModuleDestroy(): Promise<void> {
    const grace = new Promise<'timeout'>((resolve) =>
      setTimeout(
        () => resolve('timeout'),
        this.config.worker.shutdownGraceMs,
      ).unref(),
    );
    const closed = Promise.all(this.workers.map((worker) => worker.close()));
    if ((await Promise.race([closed, grace])) === 'timeout') {
      this.logger.warn(
        'Çalışan iş bitmeden kapanılıyor; kilidi düşünce başka worker devralacak',
      );
    }
  }
}
