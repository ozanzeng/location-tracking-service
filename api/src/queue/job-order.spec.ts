import { decideOrder, ORDER_STALL_MS } from './job-order.js';

describe('decideOrder', () => {
  const now = 1_000_000;

  it('sırası gelen iş (done + 1) hemen işlenir', () => {
    expect(decideOrder(5, 4, undefined, now)).toEqual({
      action: 'process',
      outOfOrder: false,
    });
  });

  it('tekrar denenen ya da geride kalmış iş beklemez', () => {
    expect(decideOrder(3, 4, undefined, now).action).toBe('process');
  });

  it('sıra no ya da sayaç yoksa (eski iş, TTL) sıra bilinmiyor: beklemez', () => {
    expect(decideOrder(undefined, 4, undefined, now).action).toBe('process');
    expect(decideOrder(7, null, undefined, now).action).toBe('process');
  });

  it('önceki iş bitmediyse bekler ve beklemeye başladığı anı kaydeder', () => {
    expect(decideOrder(6, 4, undefined, now)).toEqual({
      action: 'wait',
      wait: { done: 4, since: now },
    });
  });

  it('önceki iş ilerledikçe bekleme süresi baştan sayılır', () => {
    const previous = { done: 3, since: now - ORDER_STALL_MS - 1 };
    expect(decideOrder(6, 4, previous, now)).toEqual({
      action: 'wait',
      wait: { done: 4, since: now },
    });
  });

  it('önceki iş süre boyunca hiç ilerlemezse sırasız işlenir', () => {
    const stalled = { done: 4, since: now - ORDER_STALL_MS };
    expect(decideOrder(6, 4, stalled, now)).toEqual({
      action: 'process',
      outOfOrder: true,
    });
    const recent = { done: 4, since: now - ORDER_STALL_MS + 1 };
    expect(decideOrder(6, 4, recent, now).action).toBe('wait');
  });
});
