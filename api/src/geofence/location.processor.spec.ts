import type { DeviceLog } from '../fleet/device-log.js';
import type { Job } from 'bullmq';
import { AreaType } from '../areas/area-type.enum.js';
import { type AppConfig, loadConfig } from '../config/configuration.js';
import type { LocationJobData } from '../queue/location-job.js';
import type { RealtimePublisher } from '../realtime/realtime.publisher.js';
import type { GeofenceService } from './geofence.service.js';
import { AreaEventType } from './area-event-type.enum.js';
import type { ProcessResult } from './geofence.types.js';
import { LocationProcessor } from './location.processor.js';
import { ProcessStatus } from './process-status.enum.js';

const base = loadConfig({});

const processed = (recordedAt: string, events = 0): ProcessResult => ({
  status: ProcessStatus.PROCESSED,
  events: Array.from({ length: events }, (_, i) => ({
    logId: String(i),
    userId: 'u1',
    eventType: AreaEventType.ENTER,
    area: { id: 'a', name: 'A', type: AreaType.PARKING },
    occurredAt: recordedAt,
  })),
  position: { userId: 'u1', lat: 0, lng: 0, recordedAt, areas: [] },
});

const setup = (worker: Partial<AppConfig['worker']> = {}) => {
  const order: string[] = [];
  const geofence = {
    // Tipli mock: GeofenceService.process imzası değişirse typecheck burada da kırılır.
    process: vi.fn<GeofenceService['process']>(async (p) => {
      order.push(p.recordedAt);
      return p.recordedAt === 't2'
        ? { status: ProcessStatus.STALE }
        : processed(p.recordedAt, 1);
    }),
  } satisfies Partial<GeofenceService>;
  const publish = vi.fn().mockResolvedValue(undefined);
  const record = vi.fn<DeviceLog['record']>().mockResolvedValue(undefined);
  const processor = new LocationProcessor(
    geofence as unknown as GeofenceService,
    { publish } as unknown as RealtimePublisher,
    { record } as unknown as DeviceLog,
    { ...base, worker: { ...base.worker, ...worker } },
  );
  return { processor, geofence, publish, record, order };
};

const makeJob = (data: object) =>
  ({
    id: 'j1',
    queueName: 'locations-3',
    timestamp: Date.now(),
    data,
  }) as unknown as Job<LocationJobData>;

const points = [
  { lat: 1, lng: 1, recordedAt: 't1' },
  { lat: 2, lng: 2, recordedAt: 't2' },
  { lat: 3, lng: 3, recordedAt: 't3' },
];

describe('LocationProcessor.process', () => {
  afterEach(() => vi.useRealTimers());

  it('işteki noktaları sırayla işler; eski noktalar yayınlanmaz', async () => {
    const { processor, publish, order } = setup();

    expect(await processor.process(makeJob({ userId: 'u1', points }))).toEqual({
      processed: 2,
      stale: 1,
      events: 2,
    });
    expect(order).toEqual(['t1', 't2', 't3']);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls.map((c) => c[0].position.recordedAt)).toEqual([
      't1',
      't3',
    ]);
  });

  it('cihaz günlüğüne işteki her nokta, sonucu ve olaylarıyla tek seferde yazılır (eskiler dahil)', async () => {
    const { processor, record } = setup();
    await processor.process(
      makeJob({ userId: 'u1', points, requestId: 'r-1' }),
    );
    expect(record).toHaveBeenCalledTimes(1);
    const [scooterId, entries] = record.mock.calls[0];
    expect(scooterId).toBe('u1');
    expect(
      entries.map((e) => [
        e.recordedAt,
        e.result,
        e.events.length,
        e.requestId,
      ]),
    ).toEqual([
      ['t1', 'PROCESSED', 1, 'r-1'],
      ['t2', 'STALE', 0, 'r-1'],
      ['t3', 'PROCESSED', 1, 'r-1'],
    ]);
    expect(entries[0].events[0]).toEqual({
      type: AreaEventType.ENTER,
      area: { id: 'a', name: 'A', type: AreaType.PARKING },
    });
  });

  it('geçici hatada noktayı işin içinde yeniden dener, işlenmiş noktaları tekrarlamaz', async () => {
    vi.useFakeTimers();
    const { processor, geofence, publish } = setup();
    geofence.process
      .mockRejectedValueOnce(new Error('bağlantı koptu'))
      .mockRejectedValueOnce(new Error('bağlantı koptu'));

    const result = processor.process(makeJob({ userId: 'u1', points }));
    await vi.runAllTimersAsync();

    await expect(result).resolves.toEqual({
      processed: 2,
      stale: 1,
      events: 2,
    });
    // İlk nokta 3. denemede işlendi; sonraki noktalar birer kez.
    expect(geofence.process.mock.calls.map(([p]) => p.recordedAt)).toEqual([
      't1',
      't1',
      't1',
      't2',
      't3',
    ]);
    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('yeniden denemeden önce bekler, bekleme her denemede ikiye katlanır', async () => {
    vi.useFakeTimers();
    const { processor, geofence } = setup();
    geofence.process
      .mockRejectedValueOnce(new Error('zaman aşımı'))
      .mockRejectedValueOnce(new Error('zaman aşımı'));

    const result = processor.process(
      makeJob({ userId: 'u1', points: [points[0]] }),
    );
    await vi.advanceTimersByTimeAsync(199);
    expect(geofence.process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(geofence.process).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(399);
    expect(geofence.process).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(geofence.process).toHaveBeenCalledTimes(3);
    await expect(result).resolves.toMatchObject({ processed: 1 });
  });

  it('denemeler tükenirse iş başarısız olur ve sonraki noktalara geçilmez', async () => {
    vi.useFakeTimers();
    const { processor, geofence, publish } = setup();
    geofence.process.mockRejectedValue(new Error('DB yok'));

    const result = processor.process(makeJob({ userId: 'u1', points }));
    const failed = expect(result).rejects.toThrow('DB yok');
    await vi.runAllTimersAsync();
    await failed;

    expect(geofence.process).toHaveBeenCalledTimes(3);
    expect(publish).not.toHaveBeenCalled();
  });

  it('deneme sayısını ve beklemeyi ayarlardan alır (WORKER_POINT_ATTEMPTS, WORKER_RETRY_DELAY_MS)', async () => {
    vi.useFakeTimers();
    const { processor, geofence } = setup({
      pointAttempts: 2,
      retryBaseDelayMs: 50,
    });
    geofence.process.mockRejectedValue(new Error('DB yok'));

    const result = processor.process(
      makeJob({ userId: 'u1', points: [points[0]] }),
    );
    const failed = expect(result).rejects.toThrow('DB yok');
    await vi.advanceTimersByTimeAsync(49);
    expect(geofence.process).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await failed;
    // İkinci deneme de başarısız: toplam 2 deneme, üçüncüsü yok.
    expect(geofence.process).toHaveBeenCalledTimes(2);
  });

  it('veritabanı kapalıyken deneme sayısına takılmadan bekler, dönünce devam eder (konum kaybolmaz)', async () => {
    vi.useFakeTimers();
    const { processor, geofence, publish } = setup();
    const down = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    // 8 deneme boyunca kapalı: kalıcı hata sınırı (3) çoktan aşıldı.
    for (let i = 0; i < 8; i++) geofence.process.mockRejectedValueOnce(down);

    const result = processor.process(
      makeJob({ userId: 'u1', points: [points[0]] }),
    );
    await vi.runAllTimersAsync();
    await expect(result).resolves.toMatchObject({ processed: 1 });
    expect(geofence.process).toHaveBeenCalledTimes(9);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('geçici hata WORKER_TRANSIENT_RETRY_MS sürerse vazgeçer; bekleme WORKER_RETRY_MAX_DELAY_MS ile sınırlı', async () => {
    vi.useFakeTimers();
    const { processor, geofence } = setup({
      retryBaseDelayMs: 100,
      retryMaxDelayMs: 1000,
      transientRetryMs: 10_000,
    });
    geofence.process.mockRejectedValue(
      Object.assign(new Error('the database system is starting up'), {
        code: '57P03',
      }),
    );

    const result = processor.process(
      makeJob({ userId: 'u1', points: [points[0]] }),
    );
    const failed = expect(result).rejects.toThrow('starting up');
    await vi.runAllTimersAsync();
    await failed;
    // Bekleme: 100, 200, 400, 800, sonra 1000'de sabit; 10 sn'de ~15 deneme.
    const calls = geofence.process.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(13);
    expect(calls).toBeLessThanOrEqual(16);
  });

  it('eski biçimdeki tek konumlu işi (points yok) de işler', async () => {
    const { processor, geofence } = setup();
    const job = makeJob({ userId: 'u1', lat: 7, lng: 8, recordedAt: 't1' });
    expect(await processor.process(job)).toEqual({
      processed: 1,
      stale: 0,
      events: 1,
    });
    expect(geofence.process).toHaveBeenCalledWith({
      userId: 'u1',
      lat: 7,
      lng: 8,
      recordedAt: 't1',
    });
  });
});
