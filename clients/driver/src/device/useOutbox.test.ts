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

  test('400 alınca tek nokta atılır (tekrar göndermek düzeltmez)', async () => {
    sendLocations.mockRejectedValueOnce(new ApiError('lat hatalı', 400, null, 'r'));
    const { result } = renderHook(() => useOutbox(true));
    act(() => result.current.record(point(1)));
    await tick(1000);
    expect(result.current.pending).toBe(0);
    expect(result.current.log[0]).toMatchObject({ kind: 'error' });
    await tick(10_000);
    expect(sendLocations).toHaveBeenCalledTimes(1);
  });

  test('toplu istek tek hatalı nokta yüzünden 400 alırsa sadece o nokta atılır', async () => {
    // Sunucu toplu doğrulamada hepsi-ya-hiçbiri: bir nokta hatalıysa istek bütünüyle 400.
    const bad = point(37);
    sendLocations.mockImplementation(async (points: LocationPoint[]) => {
      if (points.includes(bad)) throw new ApiError('locations.37.lat hatalı', 400, null, 'r');
      return { requestId: 'r' };
    });
    const { result, rerender } = renderHook(({ online }) => useOutbox(online), { initialProps: { online: false } });
    const points = Array.from({ length: 100 }, (_, i) => (i === 37 ? bad : point(i)));
    act(() => points.forEach((p) => result.current.record(p)));
    rerender({ online: true });
    await tick(20_000);
    // İkiye bölme: 100 noktada tek hatalıyı bulmak ~log2(100) kat istek sürer.
    expect(sendLocations.mock.calls.length).toBeLessThanOrEqual(20);

    const delivered = sendLocations.mock.settledResults
      .map((r, i) => (r.type === 'fulfilled' ? (sendLocations.mock.calls[i][0] as LocationPoint[]) : []))
      .flat();
    expect(delivered).toHaveLength(99);
    expect(new Set(delivered)).toEqual(new Set(points.filter((p) => p !== bad)));
    expect(result.current.pending).toBe(0);
    expect(result.current.log.some((e) => e.kind === 'error' && e.text.includes('(400)'))).toBe(true);
  });

  test('ardışık hatalı noktaların her biri tek istekle atılır, baştan bölme yapılmaz', async () => {
    // Cihaz saati ileride: sunucu her noktayı "timestamp gelecekte" diye reddeder.
    sendLocations.mockRejectedValue(new ApiError('timestamp gelecekte olamaz', 400, null, 'r'));
    const { result, rerender } = renderHook(({ online }) => useOutbox(online), { initialProps: { online: false } });
    act(() => {
      for (let i = 0; i < 40; i++) result.current.record(point(i));
    });
    rerender({ online: true });
    await tick(60_000);
    // İlk bölme ~log2(40) istek, sonra nokta başına bir istek. Önceki kod her noktada
    // sınırı 100'e döndürüp baştan bölüyordu (nokta başına ~6 istek).
    expect(result.current.pending).toBe(0);
    expect(sendLocations.mock.calls.length).toBeLessThanOrEqual(40 + 7);
  });

  test('hatalı nokta atıldıktan sonra sıradaki nokta sağlamsa grup hemen tam boyuta döner', async () => {
    const bad = point(0);
    sendLocations.mockImplementation(async (points: LocationPoint[]) => {
      if (points.includes(bad)) throw new ApiError('hatalı', 400, null, 'r');
      return { requestId: 'r' };
    });
    const { result, rerender } = renderHook(({ online }) => useOutbox(online), { initialProps: { online: false } });
    act(() => {
      result.current.record(bad);
      for (let i = 1; i < 300; i++) result.current.record(point(i));
    });
    rerender({ online: true });
    await tick(30_000);
    expect(result.current.pending).toBe(0);
    // 300 → 100'lük grup reddedilir, bölünür, hatalı nokta atılır; sonra tek nokta denenir
    // ve kalanlar 100'lük gruplarla gider.
    const sizes = sendLocations.mock.calls.map((c) => (c[0] as LocationPoint[]).length);
    expect(sizes.slice(-4)).toEqual([1, 100, 100, 98]);
  });

  test('gönderim sürerken kuyruk dolup baştan kırpılırsa gönderilmemiş noktalar silinmez', async () => {
    let resolveSend: (v: { requestId: string }) => void = () => {};
    sendLocations.mockImplementationOnce(() => new Promise((resolve) => (resolveSend = resolve)));
    const { result, rerender } = renderHook(({ online }) => useOutbox(online), { initialProps: { online: false } });
    act(() => {
      for (let i = 0; i < 2000; i++) result.current.record(point(i));
    });
    rerender({ online: true });
    await tick(0);
    expect(sendLocations.mock.calls[0][0][0]).toEqual(point(0));

    // İlk 100 gönderilirken 50 yeni konum: kuyruk 2000'i aşar, baştan 50 kırpılır.
    act(() => {
      for (let i = 2000; i < 2050; i++) result.current.record(point(i));
    });
    await act(async () => resolveSend({ requestId: 'r' }));
    await tick(0);

    // Kalan: gönderilmemiş 100..2049. Eski kod baştan 100 silip 100..149'u kaybediyordu.
    expect(result.current.pending).toBe(1950);
    await tick(1000);
    expect(sendLocations.mock.calls[1][0][0]).toEqual(point(100));
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
