// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { AreaEvent } from '@shared/api/types';

const handlers = new Map<string, (payload: unknown) => void>();
vi.mock('@shared/realtime/socket', () => ({
  getSocket: () => ({
    emit: vi.fn(),
    on: (event: string, handler: (payload: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  }),
}));

const { useRiderEvents } = await import('./useRiderEvents');

const event = (logId: string): AreaEvent =>
  ({
    logId,
    userId: 'scooter-1',
    eventType: 'ENTER',
    area: { id: 'a', name: 'Park', type: 'PARKING' },
    occurredAt: '2026-09-28T10:00:00Z',
  }) as AreaEvent;

describe('useRiderEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    handlers.clear();
  });
  afterEach(() => vi.useRealTimers());

  test('bölge olayı levha olarak gösterilir ve süresi dolunca kalkar', () => {
    const { result } = renderHook(() => useRiderEvents('scooter-1'));
    act(() => handlers.get('area-event')?.(event('1')));
    expect(result.current.plates).toHaveLength(1);
    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.plates).toHaveLength(0);
  });

  test('ekran kapanınca levha zamanlayıcıları temizlenir', () => {
    const { unmount } = renderHook(() => useRiderEvents('scooter-1'));
    act(() => {
      handlers.get('area-event')?.(event('1'));
      handlers.get('area-event')?.(event('2'));
    });
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
