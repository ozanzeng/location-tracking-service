// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Scooter } from '../api/types';

const scooters = vi.fn<() => Promise<Scooter[]>>();
vi.mock('../api/client', () => ({ api: { scooters: () => scooters() } }));
const handlers = new Map<string, (arg?: unknown) => void>();
vi.mock('../realtime/socket', () => ({
  getSocket: () => ({
    on: (event: string, fn: (arg?: unknown) => void) => handlers.set(event, fn),
    off: (event: string) => handlers.delete(event),
  }),
}));

const { useScooters } = await import('./useScooters');

describe('useScooters', () => {
  beforeEach(() => {
    handlers.clear();
    scooters.mockReset().mockResolvedValue([]);
  });

  test('filo duyurusu gelince liste yenilenir', async () => {
    const { result } = renderHook(() => useScooters());
    await act(async () => undefined);
    expect(result.current.scooters).toEqual([]);

    const updated: Scooter[] = [{ id: 's1', name: 's1', status: 'IN_USE', lastSeenAt: null }];
    scooters.mockResolvedValue(updated);
    await act(async () => handlers.get('scooters-changed')?.({ change: 'rentals', scooterId: 's1' }));
    expect(result.current.scooters).toEqual(updated);
  });

  test('istek sürerken gelen duyurular bittiğinde tek bir yeni istekle karşılanır', async () => {
    let release!: (v: Scooter[]) => void;
    scooters.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    renderHook(() => useScooters());
    await act(async () => {
      handlers.get('scooters-changed')?.({});
      handlers.get('scooters-changed')?.({});
    });
    expect(scooters).toHaveBeenCalledTimes(1);
    await act(async () => release([]));
    expect(scooters).toHaveBeenCalledTimes(2);
  });
});
