import { HttpStatus } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { loadConfig } from '../config/configuration.js';
import { QueueBackpressure } from './queue-backpressure.js';

const withBacklog = (
  maxBacklog: number,
  getWaitingCount: () => Promise<number>,
) => {
  const base = loadConfig({});
  return new QueueBackpressure({ getWaitingCount } as unknown as Queue, {
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
