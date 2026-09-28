import { loadConfig } from '../config/configuration.js';
import {
  LaneLayoutError,
  type LocationLanes,
} from '../queue/location-lanes.js';
import { LaneWorkers } from './lane-workers.js';
import type { LocationProcessor } from './location.processor.js';

const lanesMock = () => {
  const calls: string[] = [];
  const lanes = {
    count: 4,
    connection: {},
    verifyLayout: vi.fn(async () => void calls.push('verify')),
    enforceOneJobPerLane: vi.fn(async () => void calls.push('enforce')),
    queues: vi.fn(() => {
      calls.push('workers');
      return [];
    }),
  };
  return { lanes, calls };
};

const workersFor = (lanes: object) =>
  new LaneWorkers(
    lanes as unknown as LocationLanes,
    {} as LocationProcessor,
    loadConfig({}),
  );

describe('LaneWorkers', () => {
  it("şerit düzenini doğrular ve tek-iş sınırını worker'lar iş almadan önce kurar", async () => {
    const { lanes, calls } = lanesMock();
    await workersFor(lanes).onApplicationBootstrap();
    expect(calls).toEqual(['verify', 'enforce', 'workers']);
  });

  it('şerit sayısı kurulu olandan farklıysa hiçbir şeridi dinlemeden açılmayı reddeder', async () => {
    const { lanes } = lanesMock();
    lanes.verifyLayout.mockRejectedValue(
      new LaneLayoutError(4, '64', 'geofence:lanes'),
    );
    await expect(workersFor(lanes).onApplicationBootstrap()).rejects.toThrow(
      /QUEUE_LANES=4.*64/,
    );
    expect(lanes.enforceOneJobPerLane).not.toHaveBeenCalled();
    expect(lanes.queues).not.toHaveBeenCalled();
  });
});

describe('LaneWorkers kapanışı', () => {
  it('çalışan iş bitmezse (ör. veritabanı kapalı) WORKER_SHUTDOWN_GRACE_MS sonra beklemeyi bırakır', async () => {
    const base = loadConfig({});
    const workers = new LaneWorkers(
      lanesMock().lanes as unknown as LocationLanes,
      {} as LocationProcessor,
      { ...base, worker: { ...base.worker, shutdownGraceMs: 50 } },
    );
    // Hiç bitmeyen iş: close() dönmez.
    (workers as unknown as { workers: object[] }).workers = [
      { close: () => new Promise(() => {}) },
    ];
    const started = Date.now();
    await workers.onModuleDestroy();
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
