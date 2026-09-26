// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '@shared/api/client';
import type { LocationPoint } from '@shared/api/types';

const sendLocations = vi.fn();
vi.mock('@shared/api/client', async (original) => ({
  ...(await original<typeof import('@shared/api/client')>()),
  api: { sendLocations: (points: LocationPoint[]) => sendLocations(points) },
}));

const { useOutbox } = await import('./useOutbox');

const point = (i: number): LocationPoint => ({ userId: 'u1', lat: i, lng: i, timestamp: `t${i}` });
/** Zamanlayıcıları ilerletip bekleyen promise'lerin tamamlanmasını sağlar. */
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

describe('useOutbox (cihaz gönderim kuyruğu)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sendLocations.mockReset().mockResolvedValue({ requestId: 'r' });
  });
  afterEach(() => vi.useRealTimers());

  test('çevrimiçiyken tek konum hemen gönderilir', async () => {
    const { result } = renderHook(() => useOutbox(true));
    act(() => result.current.record(point(1)));
    await tick(1000);
    expect(sendLocations).toHaveBeenCalledWith([point(1)]);
    expect(result.current.pending).toBe(0);
    expect(result.current.log[0].text).toBe('Konum gönderildi');
  });

  test('çevrimdışıyken birikir, bağlanınca tek toplu istekle gider', async () => {
    const { result, rerender } = renderHook(({ online }) => useOutbox(online), { initialProps: { online: false } });
    act(() => {
      result.current.record(point(1));
      result.current.record(point(2));
      result.current.record(point(3));
    });
    await tick(3000);
    expect(sendLocations).not.toHaveBeenCalled();
    expect(result.current.pending).toBe(3);

    rerender({ online: true });
    await tick(1000);
    expect(sendLocations).toHaveBeenCalledTimes(1);
    expect(sendLocations).toHaveBeenCalledWith([point(1), point(2), point(3)]);
    expect(result.current.pending).toBe(0);
    expect(result.current.log.some((e) => e.text === 'Biriken 3 konum toplu gönderildi')).toBe(true);
  });

  test('429 alınca Retry-After kadar bekler, sonra tekrar dener; nokta kaybolmaz', async () => {
    sendLocations.mockRejectedValueOnce(new ApiError('sınır', 429, 10, 'r'));
    const { result } = renderHook(() => useOutbox(true));
    act(() => result.current.record(point(1)));
    await tick(1000);
    expect(sendLocations).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(1);

    await tick(5000); // Retry-After dolmadı
    expect(sendLocations).toHaveBeenCalledTimes(1);

    await tick(6000);
    expect(sendLocations).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(0);
  });

  test('400 alınca o grup atılır (tekrar göndermek düzeltmez)', async () => {
    sendLocations.mockRejectedValueOnce(new ApiError('lat hatalı', 400, null, 'r'));
    const { result } = renderHook(() => useOutbox(true));
    act(() => result.current.record(point(1)));
    await tick(1000);
    expect(result.current.pending).toBe(0);
    expect(result.current.log[0]).toMatchObject({ kind: 'error' });
    await tick(10_000);
    expect(sendLocations).toHaveBeenCalledTimes(1);
  });

  test('ağ hatasında noktalar korunur ve 5 sn sonra tekrar denenir', async () => {
    sendLocations.mockRejectedValueOnce(new ApiError('Sunucuya ulaşılamadı', 0, null, null));
    const { result } = renderHook(() => useOutbox(true));
    act(() => result.current.record(point(1)));
    await tick(1000);
    expect(result.current.pending).toBe(1);
    await tick(5000);
    expect(sendLocations).toHaveBeenCalledTimes(2);
    expect(result.current.pending).toBe(0);
  });

  test('bir istekte en fazla 100 konum gider', async () => {
    const { result, rerender } = renderHook(({ online }) => useOutbox(online), { initialProps: { online: false } });
    act(() => {
      for (let i = 0; i < 150; i++) result.current.record(point(i));
    });
    rerender({ online: true });
    await tick(1000);
    expect(sendLocations.mock.calls[0][0]).toHaveLength(100);
    await tick(1000);
    expect(sendLocations.mock.calls[1][0]).toHaveLength(50);
    expect(result.current.pending).toBe(0);
  });
});
