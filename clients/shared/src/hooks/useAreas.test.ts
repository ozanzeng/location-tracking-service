// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Area } from '../api/types';

const areasRequest = vi.fn<() => Promise<Area[]>>();
vi.mock('../api/client', () => ({ api: { areas: () => areasRequest() } }));
const handlers = new Map<string, (message?: unknown) => void>();
vi.mock('../realtime/socket', () => ({
  getSocket: () => ({
    on: (event: string, handler: (message?: unknown) => void) => handlers.set(event, handler),
    off: (event: string) => handlers.delete(event),
  }),
}));

const area = (id: string) => ({ id }) as Area;
const announce = (id: string) => handlers.get('areas-changed')?.({ created: { id, name: id, type: 'PARKING' } });

/** Sırayla dönen, elle çözülen istekler: süren bir isteğin ortasında olanları sınamak için. */
function manualResponses() {
  const pending: Array<(list: Area[]) => void> = [];
  areasRequest.mockImplementation(() => new Promise<Area[]>((resolve) => pending.push(resolve)));
  return {
    count: () => pending.length,
    respond: async (i: number, ids: string[]) => {
      await act(async () => pending[i](ids.map(area)));
    },
  };
}

describe('useAreas', () => {
  beforeEach(() => {
    // Alan listesi modül düzeyinde önbelleklenir: her test temiz modülle başlar.
    vi.resetModules();
    handlers.clear();
    areasRequest.mockReset().mockResolvedValue([]);
  });

  const mount = async () => {
    const { useAreas } = await import('./useAreas');
    return renderHook(() => useAreas());
  };
  const ids = (areas: Area[]) => areas.map((a) => a.id);

  test('kaydeden ekranın yenilemesi ile kendi duyurusu tek istekte kalır', async () => {
    areasRequest.mockResolvedValueOnce([]).mockResolvedValue([area('x')]);
    const { result } = await mount();
    await waitFor(() => expect(areasRequest).toHaveBeenCalledTimes(1));

    await act(async () => {
      result.current.reload('x');
      announce('x');
    });
    expect(areasRequest).toHaveBeenCalledTimes(2);
    expect(ids(result.current.areas)).toEqual(['x']);
  });

  test('süren istek duyurulan alanı içermiyorsa, bittikten sonra bir kez daha ister', async () => {
    const server = manualResponses();
    const { result } = await mount();
    // İlk yükleme sürerken başka bir operatör B'yi kaydetti; bu istek B'den önce başlamıştı.
    act(() => announce('b'));
    expect(server.count()).toBe(1);

    await server.respond(0, ['a']);
    expect(server.count()).toBe(2);
    await server.respond(1, ['a', 'b']);
    expect(ids(result.current.areas)).toEqual(['a', 'b']);
  });

  test('süren istek sırasında gelen duyurular tek ek istekte birleşir', async () => {
    const server = manualResponses();
    const { result } = await mount();
    act(() => {
      announce('b');
      announce('c');
      result.current.reload();
    });

    await server.respond(0, []);
    expect(server.count()).toBe(2);
    await server.respond(1, ['b', 'c']);
    expect(server.count()).toBe(2);
    expect(ids(result.current.areas)).toEqual(['b', 'c']);
  });

  test('duyurulan alanlar süren isteğin sonucunda varsa ek istek atılmaz', async () => {
    const server = manualResponses();
    const { result } = await mount();
    act(() => announce('b'));

    await server.respond(0, ['a', 'b']);
    expect(server.count()).toBe(1);
    expect(ids(result.current.areas)).toEqual(['a', 'b']);
  });

  test('duyurulan alan listede yoksa yeni istek atar; kimliksiz yenileme her zaman ister', async () => {
    areasRequest.mockResolvedValueOnce([area('a')]).mockResolvedValue([area('a'), area('b')]);
    const { result } = await mount();
    await waitFor(() => expect(result.current.areas).toHaveLength(1));

    await act(async () => announce('a'));
    expect(areasRequest).toHaveBeenCalledTimes(1);
    await act(async () => announce('b'));
    expect(areasRequest).toHaveBeenCalledTimes(2);
    expect(ids(result.current.areas)).toEqual(['a', 'b']);
    await act(async () => result.current.reload());
    expect(areasRequest).toHaveBeenCalledTimes(3);
  });
});
