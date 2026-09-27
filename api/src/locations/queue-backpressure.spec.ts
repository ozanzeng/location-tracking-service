import { HttpStatus } from '@nestjs/common';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { loadConfig } from '../config/configuration.js';
import { laneBacklogMax, queueBacklog } from '../metrics/metrics.js';
import type { LocationLanes } from '../queue/location-lanes.js';
import { QueueBackpressure } from './queue-backpressure.js';

/** Tek şeritte `n` iş bekliyor gibi davranan sahte şeritler. */
const withBacklog = (
  maxBacklog: number,
  getWaitingCount: () => Promise<number>,
  waitingPerLane = async () => [await getWaitingCount()],
) => {
  const base = loadConfig({});
  return new QueueBackpressure({ waitingPerLane } as unknown as LocationLanes, {
    ...base,
    backpressure: { ...base.backpressure, maxBacklog },
  });
};

describe('QueueBackpressure', () => {
  it('kuyruk eşiğin altındayken kabul eder', async () => {
    const bp = withBacklog(5, async () => 4);
    await bp.refresh();
    expect(() => bp.assertCapacity(1)).not.toThrow();
  });

  it('eşik aşılınca 503 ve Retry-After ile reddeder', async () => {
    const bp = withBacklog(5, async () => 5);
    await bp.refresh();
    try {
      bp.assertCapacity(1);
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(RetryableHttpException);
      expect((err as RetryableHttpException).getStatus()).toBe(
        HttpStatus.SERVICE_UNAVAILABLE,
      );
      expect((err as RetryableHttpException).retryAfterSeconds).toBe(5);
    }
  });

  it('kuyruk derinliği okunamazsa son bilinen değeri korur', async () => {
    let calls = 0;
    const bp = withBacklog(5, async () => {
      if (++calls > 1) throw new Error('Redis yok');
      return 10;
    });
    await bp.refresh();
    await bp.refresh();
    expect(() => bp.assertCapacity(1)).toThrow(RetryableHttpException);
  });

  it('maxBacklog 0 ise koruma kapalıdır', async () => {
    const bp = withBacklog(0, async () => 1_000_000);
    await bp.refresh();
    expect(() => bp.assertCapacity(1)).not.toThrow();
  });

  it('eşik tüm şeritlerin toplamına uygulanır; en dolu şerit ayrıca yayınlanır', async () => {
    const bp = withBacklog(
      10,
      async () => 0,
      async () => [3, 4, 0, 3],
    );
    await bp.refresh();
    expect(() => bp.assertCapacity(1)).toThrow(RetryableHttpException);
    expect((await queueBacklog.get()).values[0].value).toBe(10);
    expect((await laneBacklogMax.get()).values[0].value).toBe(4);
  });

  it('önceki okuma bitmeden yenisini başlatmaz (Redis yanıt vermezken birikmez)', async () => {
    let release: (n: number) => void = () => {};
    const getWaitingCount = vi.fn(
      () => new Promise<number>((resolve) => (release = resolve)),
    );
    const bp = withBacklog(5, getWaitingCount);
    const first = bp.refresh();
    await bp.refresh();
    await bp.refresh();
    expect(getWaitingCount).toHaveBeenCalledTimes(1);

    release(10);
    await first;
    const second = bp.refresh();
    expect(getWaitingCount).toHaveBeenCalledTimes(2);
    release(3);
    await second;
  });
});
