// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Area } from '../api/types';

const areasRequest = vi.fn<() => Promise<Area[]>>();
vi.mock('../api/client', () => ({ api: { areas: () => areasRequest() } }));
const handlers = new Map<string, () => void>();
vi.mock('../realtime/socket', () => ({
  getSocket: () => ({
    on: (event: string, handler: () => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  }),
}));

describe('useAreas', () => {
  beforeEach(() => {
    // Alan listesi modül düzeyinde önbelleklenir: her test temiz modülle başlar.
    vi.resetModules();
    handlers.clear();
    areasRequest.mockReset().mockResolvedValue([]);
  });

  test('kayıttan sonraki yenileme ile sunucunun duyurusu tek istekte birleşir', async () => {
    const { useAreas } = await import('./useAreas');
    const { result } = renderHook(() => useAreas());
    await waitFor(() => expect(areasRequest).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.reload();
      handlers.get('areas-changed')?.();
    });
    expect(areasRequest).toHaveBeenCalledTimes(2);
  });

  test('önceki yenileme bittikten sonraki duyuru yeni istek atar', async () => {
    const { useAreas } = await import('./useAreas');
    const { result } = renderHook(() => useAreas());
    await waitFor(() => expect(areasRequest).toHaveBeenCalledTimes(1));

    await act(async () => result.current.reload());
    await act(async () => handlers.get('areas-changed')?.());
    expect(areasRequest).toHaveBeenCalledTimes(3);
  });
});
