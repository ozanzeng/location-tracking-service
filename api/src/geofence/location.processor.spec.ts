import type { Job } from 'bullmq';
import type { LocationJobData } from '../queue/location-job.js';
import type { RealtimePublisher } from '../realtime/realtime.publisher.js';
import type { GeofenceService } from './geofence.service.js';
import type { ProcessResult } from './geofence.types.js';
import { LocationProcessor } from './location.processor.js';

const processed = (recordedAt: string, events = 0): ProcessResult => ({
  status: 'processed',
  events: Array.from({ length: events }, (_, i) => ({
    logId: String(i),
    userId: 'u1',
    eventType: 'ENTER' as never,
    area: { id: 'a', name: 'A', type: 'PARKING' as never },
    occurredAt: recordedAt,
  })),
  position: { userId: 'u1', lat: 0, lng: 0, recordedAt, areas: [] },
});

const setup = () => {
  const order: string[] = [];
  const geofence = {
    process: vi.fn(async (p: { recordedAt: string }) => {
      order.push(p.recordedAt);
      return p.recordedAt === 't2'
        ? ({ status: 'stale' } as const)
        : processed(p.recordedAt, 1);
    }),
  };
  const publish = vi.fn().mockResolvedValue(undefined);
  const processor = new LocationProcessor(
    geofence as unknown as GeofenceService,
    { publish } as unknown as RealtimePublisher,
  );
  return { processor, geofence, publish, order };
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
