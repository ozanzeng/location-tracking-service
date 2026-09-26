import { DelayedError, type Job, type Queue } from 'bullmq';
import { loadConfig } from '../config/configuration.js';
import type { LocationJobData } from '../queue/location-job.js';
import type { UserSequencer } from '../queue/user-sequencer.js';
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

const setup = (lastCompleted: number | null = null) => {
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
  const sequencer = {
    lastCompleted: vi.fn().mockResolvedValue(lastCompleted),
    complete: vi.fn().mockResolvedValue(null),
    markWaiting: vi.fn().mockResolvedValue(undefined),
  };
  const promote = vi.fn().mockResolvedValue(undefined);
  const queue = { getJob: vi.fn().mockResolvedValue({ promote }) };
  const processor = new LocationProcessor(
    geofence as unknown as GeofenceService,
    { publish } as unknown as RealtimePublisher,
    loadConfig({}),
    sequencer as unknown as UserSequencer,
    queue as unknown as Queue<LocationJobData>,
  );
  return { processor, geofence, publish, sequencer, queue, promote, order };
};

const makeJob = (data: object) => {
  const job = {
    id: 'j1',
    timestamp: Date.now(),
    data,
    updateData: vi.fn(async (d: object) => {
      job.data = d;
    }),
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
  };
  return job;
};
const asJob = (job: ReturnType<typeof makeJob>) =>
  job as unknown as Job<LocationJobData>;

const points = [
  { lat: 1, lng: 1, recordedAt: 't1' },
  { lat: 2, lng: 2, recordedAt: 't2' },
  { lat: 3, lng: 3, recordedAt: 't3' },
];

describe('LocationProcessor.process', () => {
  it('işteki noktaları sırayla işler; eski noktalar yayınlanmaz', async () => {
    const { processor, publish, order } = setup();
    const job = makeJob({ userId: 'u1', points });

    expect(await processor.process(asJob(job))).toEqual({
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

  it('sırası gelen işi işler ve tamamlandı olarak işaretler', async () => {
    const { processor, sequencer, geofence, queue } = setup(4);
    await processor.process(asJob(makeJob({ userId: 'u1', points, seq: 5 })));
    expect(geofence.process).toHaveBeenCalledTimes(3);
    expect(sequencer.complete).toHaveBeenCalledWith('u1', 5);
    expect(queue.getJob).not.toHaveBeenCalled();
  });

  it('bitince sırasını bekleyen ardıl işi öne alır', async () => {
    const { processor, sequencer, queue, promote } = setup(4);
    sequencer.complete.mockResolvedValue('j9');
    await processor.process(asJob(makeJob({ userId: 'u1', points, seq: 5 })));
    expect(queue.getJob).toHaveBeenCalledWith('j9');
    expect(promote).toHaveBeenCalled();
  });

  it('ardıl öne alınamazsa (henüz ertelenmemiş) iş yine başarılı sayılır', async () => {
    const { processor, sequencer, promote } = setup(4);
    sequencer.complete.mockResolvedValue('j9');
    promote.mockRejectedValue(new Error('Job is not in the delayed state'));
    await expect(
      processor.process(asJob(makeJob({ userId: 'u1', points, seq: 5 }))),
    ).resolves.toMatchObject({ processed: 2 });
  });

  it('önceki iş bitmediyse hiçbir noktayı işlemeden ertelenir', async () => {
    const { processor, sequencer, geofence } = setup(3);
    const job = makeJob({ userId: 'u1', points, seq: 5 });

    await expect(processor.process(asJob(job), 'token')).rejects.toBeInstanceOf(
      DelayedError,
    );
    expect(geofence.process).not.toHaveBeenCalled();
    expect(sequencer.complete).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledWith(expect.any(Number), 'token');
    expect(job.data).toMatchObject({ orderWait: { done: 3 } });
    expect(sequencer.markWaiting).toHaveBeenCalledWith('u1', 5, 'j1');

    // Önceki iş ilerlemedikçe bekleme durumu tekrar yazılmaz.
    await expect(processor.process(asJob(job), 'token')).rejects.toBeInstanceOf(
      DelayedError,
    );
    expect(job.updateData).toHaveBeenCalledTimes(1);
  });

  it('sırası gelmediği halde önceki iş uzun süre ilerlemediyse işlenir', async () => {
    const { processor, sequencer, geofence } = setup(3);
    const job = makeJob({
      userId: 'u1',
      points,
      seq: 5,
      orderWait: { done: 3, since: Date.now() - 60_000 },
    });
    await processor.process(asJob(job));
    expect(geofence.process).toHaveBeenCalledTimes(3);
    expect(sequencer.complete).toHaveBeenCalledWith('u1', 5);
  });

  it('eski biçimdeki tek konumlu işi (points yok) de işler', async () => {
    const { processor, geofence, sequencer } = setup();
    const job = makeJob({ userId: 'u1', lat: 7, lng: 8, recordedAt: 't1' });
    expect(await processor.process(asJob(job))).toEqual({
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
    expect(sequencer.lastCompleted).not.toHaveBeenCalled();
    expect(sequencer.complete).not.toHaveBeenCalled();
  });
});
