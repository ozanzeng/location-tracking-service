// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { LogEntry, LogQuery } from '@shared/api/types';
import { EMPTY_FILTERS, type LogFilters } from './logFilters';

type Page = { data: LogEntry[]; nextCursor: string | null };
const pending: Array<{ query: LogQuery; resolve: (p: Page) => void }> = [];
vi.mock('@shared/api/client', () => ({
  api: {
    logs: (query: LogQuery) => new Promise<Page>((resolve) => pending.push({ query, resolve })),
  },
}));
vi.mock('@shared/realtime/socket', () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }),
}));

const { useLogs } = await import('./useLogs');

const row = (userId: string) => ({ id: userId, userId }) as unknown as LogEntry;
const respond = async (i: number, page: Page) => {
  await act(async () => pending[i].resolve(page));
};

describe('useLogs', () => {
  beforeEach(() => {
    pending.length = 0;
  });

  test('eski filtrenin geç gelen yanıtı yeni filtrenin sonucunu ezmez', async () => {
    const { result, rerender } = renderHook(({ f }) => useLogs(f), {
      initialProps: { f: EMPTY_FILTERS as LogFilters },
    });
    rerender({ f: { ...EMPTY_FILTERS, userId: 'yeni' } });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1].query.userId).toBe('yeni');

    await respond(1, { data: [row('yeni')], nextCursor: null });
    await respond(0, { data: [row('eski')], nextCursor: 'c-eski' });

    expect(result.current.rows.map((r) => r.userId)).toEqual(['yeni']);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.loading).toBe(false);
  });

  test('filtre değişmeden önce istenen sonraki sayfa yeni sonuca eklenmez', async () => {
    const { result, rerender } = renderHook(({ f }) => useLogs(f), {
      initialProps: { f: EMPTY_FILTERS as LogFilters },
    });
    await respond(0, { data: [row('a')], nextCursor: 'c1' });
    act(() => void result.current.loadMore());
    rerender({ f: { ...EMPTY_FILTERS, userId: 'b' } });
    await waitFor(() => expect(pending).toHaveLength(3));

    await respond(2, { data: [row('b')], nextCursor: null });
    await respond(1, { data: [row('a2')], nextCursor: null });

    expect(result.current.rows.map((r) => r.userId)).toEqual(['b']);
  });
});
