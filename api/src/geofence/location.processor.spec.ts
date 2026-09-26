import type { Job } from 'bullmq';
import { loadConfig } from '../config/configuration.js';
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

describe('LocationProcessor.process', () => {
  it('işteki noktaları sırayla işler; eski noktalar yayınlanmaz', async () => {
    const order: string[] = [];
    const geofence = {
      process: vi.fn(async (p: { recordedAt: string }) => {
        order.push(p.recordedAt);
        return p.recordedAt === 't2'
          ? ({ status: 'stale' } as const)
          : processed(p.recordedAt, 1);
      }),
    } as unknown as GeofenceService;
    const publish = vi.fn().mockResolvedValue(undefined);
    const processor = new LocationProcessor(
      geofence,
      { publish } as unknown as RealtimePublisher,
      loadConfig({}),
    );

    const job = {
      timestamp: Date.now(),
      data: {
        userId: 'u1',
        points: [
          { lat: 1, lng: 1, recordedAt: 't1' },
          { lat: 2, lng: 2, recordedAt: 't2' },
          { lat: 3, lng: 3, recordedAt: 't3' },
        ],
      },
    } as unknown as Job<LocationJobData>;

    expect(await processor.process(job)).toEqual({
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
});
