import type { Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { type AppConfig, loadConfig } from '../src/config/configuration.js';
import { createLaneWorker } from '../src/geofence/lane-workers.js';
import { laneOf } from '../src/queue/lanes.js';
import { LaneLayoutError, LocationLanes } from '../src/queue/location-lanes.js';
import type { LocationJobData } from '../src/queue/location-job.js';

/**
 * Şerit mekanizması gerçek Redis üzerinde: birden çok worker süreci (burada aynı şeride bağlı
 * iki Worker) varken bile şeritte aynı anda tek iş, geliş sırası ve çöken worker'ın işinin
 * geri alınması. Diğer testlerle karışmasın diye kendi önekini kullanır.
 */
const run = Date.now().toString(36);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const until = async (condition: () => boolean, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Koşul zamanında sağlanmadı');
    await sleep(20);
  }
};

describe('Kullanıcı şeritleri (gerçek Redis)', () => {
  let config: AppConfig;
  let lanes: LocationLanes;
  const workers: Worker[] = [];

  const job = (userId: string, label: string): LocationJobData => ({
    userId,
    points: [{ lat: 0, lng: 0, recordedAt: label }],
  });
  const label = (j: Job<LocationJobData>) => j.data.points[0].recordedAt;
  const startWorker = (
    lane: number,
    processor: (j: Job<LocationJobData>) => Promise<unknown>,
  ) => {
    const worker = createLaneWorker(
      lanes.queues()[lane].name,
      processor,
      config,
      lanes.connection,
    );
    workers.push(worker);
    return worker;
  };

  beforeEach(async () => {
    const base = loadConfig();
    config = {
      ...base,
      queue: { ...base.queue, prefix: `geofence-lanes-${run}`, lanes: 4 },
      // Çöken worker senaryosu saniyeler içinde bitsin.
      worker: { ...base.worker, lockMs: 1000, stalledCheckMs: 200 },
    };
    lanes = new LocationLanes(config);
    await lanes.verifyLayout();
    await lanes.enforceOneJobPerLane();
  });

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((w) => w.close(true)));
    await Promise.all(lanes.queues().map((q) => q.obliterate({ force: true })));
    await lanes.connection.del(`${config.queue.prefix}:lanes`);
    await lanes.onApplicationShutdown();
  });

  it('iki worker aynı şeridi dinlerken bile işler tek tek ve geliş sırasıyla işlenir', async () => {
    const lane = laneOf('u1', 4);
    for (let i = 0; i < 12; i++) await lanes.add(job('u1', `t${i}`));

    const seen: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const processor = async (j: Job<LocationJobData>) => {
      maxRunning = Math.max(maxRunning, ++running);
      await sleep(15);
      seen.push(label(j));
      running--;
    };
    // İki ayrı worker süreci gibi: her biri concurrency 1, ikisi aynı şeritte.
    startWorker(lane, processor);
    startWorker(lane, processor);

    await until(() => seen.length === 12);
    expect(maxRunning).toBe(1);
    expect(seen).toEqual(Array.from({ length: 12 }, (_, i) => `t${i}`));
  });

  it('denemeleri tükenen iş şeridi tıkamaz: sonraki iş hemen işlenir', async () => {
    const lane = laneOf('u2', 4);
    await lanes.add(job('u2', 'bozuk'));
    await lanes.add(job('u2', 'sağlam'));

    const done: Array<{ label: string; at: number }> = [];
    const started = Date.now();
    startWorker(lane, async (j) => {
      if (label(j) === 'bozuk') throw new Error('işlenemedi');
      done.push({ label: label(j), at: Date.now() - started });
    });

    await until(() => done.length === 1, 12_000);
    expect(done[0].label).toBe('sağlam');
    // Eski tasarımda sonraki iş 30 sn bekliyordu; makine yüklüyken de sığacak geniş bir sınır.
    expect(done[0].at).toBeLessThan(10_000);
    const counts = await lanes.queues()[lane].getJobCounts('failed');
    expect(counts.failed).toBe(1);
  });

  it("çöken worker'ın işi kilidi düşünce şeridin önüne geri alınır; sonraki iş öne geçmez", async () => {
    const lane = laneOf('u3', 4);
    await lanes.add(job('u3', 'ilk'));
    await lanes.add(job('u3', 'ikinci'));

    // 1. worker ilk işi alır ve takılır; sonra süreç ölmüş gibi kapatılır (kilit yenilenmez).
    let release: () => void = () => {};
    let crashedStarted = false;
    const crashed = startWorker(lane, async () => {
      crashedStarted = true;
      await new Promise<void>((resolve) => (release = resolve));
    });
    await until(() => crashedStarted);
    await crashed.close(true);

    const seen: string[] = [];
    const started = Date.now();
    startWorker(lane, async (j) => {
      seen.push(label(j));
    });

    await until(() => seen.length === 2, 12_000);
    expect(seen).toEqual(['ilk', 'ikinci']);
    // Kilit 1 sn'de düşer, 200 ms'lik iki aramada bulunur (~1,5 sn); yüklü makine için pay.
    expect(Date.now() - started).toBeLessThan(10_000);
    release();
  });

  it('iki kez takılan iş (ör. makine donması) kaybolmaz: sonraki worker işler', async () => {
    const lane = laneOf('u4', 4);
    await lanes.add(job('u4', 'donan'));

    // İki worker sırayla işi alır ve donmuş gibi kapanır: kilit yenilenmez, iş iki kez takılır.
    for (let k = 0; k < 2; k++) {
      let started = false;
      const frozen = startWorker(lane, async () => {
        started = true;
        await new Promise(() => {});
      });
      await until(() => started, 12_000);
      await frozen.close(true);
    }

    const seen: string[] = [];
    startWorker(lane, async (j) => {
      seen.push(label(j));
    });
    await until(() => seen.length === 1, 12_000);
    expect(seen).toEqual(['donan']);
    // BullMQ varsayılanıyla (maxStalledCount 1) ikinci takılmada başarısız sayılırdı.
    const counts = await lanes.queues()[lane].getJobCounts('failed');
    expect(counts.failed).toBe(0);
  });

  it('eklenen işler kullanıcının şeridine gider; toplu eklemede kimlikler sırayı korur', async () => {
    const ids = await lanes.addMany([
      job('a', 'a1'),
      job('b', 'b1'),
      job('a', 'a2'),
    ]);
    const [laneA, laneB] = [laneOf('a', 4), laneOf('b', 4)];
    expect(ids.map((id) => id.split(':')[0])).toEqual([
      String(laneA),
      String(laneB),
      String(laneA),
    ]);
    // Her kimlik, işi kendi şeridinde bulur.
    const labels = await Promise.all(
      ids.map(async (id) => {
        const [lane, jobId] = id.split(':');
        const found = await lanes.queues()[Number(lane)].getJob(jobId);
        return found && label(found as Job<LocationJobData>);
      }),
    );
    expect(labels).toEqual(['a1', 'b1', 'a2']);
  });

  it('şerit sayısı kurulu olandan farklıysa açılmayı reddeder', async () => {
    const other = new LocationLanes({
      ...config,
      queue: { ...config.queue, lanes: 8 },
    });
    try {
      await expect(other.verifyLayout()).rejects.toBeInstanceOf(
        LaneLayoutError,
      );
      await expect(other.verifyLayout()).rejects.toThrow(/QUEUE_LANES=8.*4/);
    } finally {
      await other.onApplicationShutdown();
    }
  });
});

describe('Kuyruk düzeni anahtarı', () => {
  it('ilk açılan süreç şerit sayısını yazar', async () => {
    const base = loadConfig();
    const prefix = `geofence-layout-${run}`;
    const lanes = new LocationLanes({
      ...base,
      queue: { ...base.queue, prefix, lanes: 5 },
    });
    const redis = new Redis(base.redisUrl);
    try {
      await lanes.verifyLayout();
      expect(await redis.get(`${prefix}:lanes`)).toBe('5');
    } finally {
      await redis.del(`${prefix}:lanes`);
      await redis.quit();
      await lanes.onApplicationShutdown();
    }
  });
});
