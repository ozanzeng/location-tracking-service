// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Area, LocationPoint } from '@shared/api/types';
import type { LatLng } from '../geo/latlng';
import { useGpsSampler } from './useGpsSampler';

/** 29.02–29.03 boylam, 40.98–40.99 enlem arası park alanı. */
const park: Area = {
  id: 'park',
  name: 'Park',
  type: 'PARKING',
  createdAt: '2026-09-28T00:00:00.000Z',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [29.02, 40.98],
        [29.03, 40.98],
        [29.03, 40.99],
        [29.02, 40.99],
        [29.02, 40.98],
      ],
    ],
  },
};
const OUTSIDE = { lat: 40.97, lng: 29.0 };
const OUTSIDE_2 = { lat: 40.971, lng: 29.001 };
const INSIDE = { lat: 40.985, lng: 29.025 };
const INSIDE_2 = { lat: 40.986, lng: 29.026 };

interface Props {
  position: LatLng;
  areas: Area[];
  active: boolean;
}

describe('useGpsSampler (konum ölçümü)', () => {
  let record: ReturnType<typeof vi.fn<(p: LocationPoint) => void>>;

  const render = (initial: Partial<Props> = {}) => {
    const live = { current: initial.position ?? OUTSIDE };
    const hook = renderHook(
      ({ position, areas, active }: Props) => useGpsSampler(active, 'scooter-1', live, position, areas, record),
      { initialProps: { position: OUTSIDE, areas: [park], active: true, ...initial } },
    );
    /** Scooter'ı taşır: oynatma ve sürükleme gibi hem canlı konumu hem ekrandaki konumu günceller. */
    const moveTo = (position: LatLng, props: Partial<Props> = {}) => {
      live.current = position;
      hook.rerender({ position, areas: [park], active: true, ...props });
    };
    return { ...hook, moveTo };
  };
  const sampledAt = () => record.mock.calls.map(([p]) => ({ lat: p.lat, lng: p.lng }));

  beforeEach(() => {
    vi.useFakeTimers();
    record = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  test('sürüş boyunca 5 saniyede bir ölçer', async () => {
    render();
    expect(record).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(15_000));
    expect(record).toHaveBeenCalledTimes(4);
  });

  test('alana girince 5 saniyeyi beklemeden hemen ölçer, düzenli ölçüm oradan devam eder', async () => {
    const { moveTo } = render();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    moveTo(INSIDE);
    expect(sampledAt()).toEqual([OUTSIDE, INSIDE]);

    // Sayaç sıfırlandı: bir sonraki düzenli ölçüm girişten 5 sn sonra, 3 sn sonra değil.
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(record).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(record).toHaveBeenCalledTimes(3);
  });

  test('alandan çıkınca da hemen ölçer', async () => {
    const { moveTo } = render({ position: INSIDE });
    await act(() => vi.advanceTimersByTimeAsync(2000));
    moveTo(OUTSIDE);
    expect(sampledAt()).toEqual([INSIDE, OUTSIDE]);
  });

  test('aynı alanın içinde ya da dışında hareket ek ölçüm yapmaz', async () => {
    const { moveTo } = render();
    moveTo(OUTSIDE_2);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    moveTo(INSIDE);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    moveTo(INSIDE_2);
    expect(sampledAt()).toEqual([OUTSIDE, INSIDE]);
  });

  test('sınırda gidip gelen scooter saniyede birden fazla ölçüm göndermez', async () => {
    const { moveTo } = render();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    moveTo(INSIDE);
    moveTo(OUTSIDE_2);
    // İkinci geçiş, ilk ek ölçümden 1 sn sonraya ertelenir; o anki konum gönderilir.
    expect(record).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(sampledAt()).toEqual([OUTSIDE, INSIDE, OUTSIDE_2]);
  });

  test('yeni alan tanımlanınca (scooter yerinden oynamadan) ek ölçüm yapmaz', async () => {
    const { rerender } = render({ position: INSIDE });
    const other = { ...park, id: 'other' };
    rerender({ position: INSIDE, areas: [park, other], active: true });
    expect(record).toHaveBeenCalledTimes(1);
  });

  test('sürüş yokken alana girmek ölçüm yapmaz', async () => {
    const { moveTo } = render({ active: false });
    moveTo(INSIDE, { active: false });
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(record).not.toHaveBeenCalled();
  });
});
