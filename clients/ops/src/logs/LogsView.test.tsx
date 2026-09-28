// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { LogEntry } from '@shared/api/types';

const rows: LogEntry[] = Array.from({ length: 3 }, (_, i) => ({
  id: `log-${i}`,
  userId: `scooter-${i}`,
  areaId: 'park',
  areaName: 'Park',
  areaType: 'PARKING',
  entryTime: '2026-09-28T10:00:00.000Z',
  exitTime: null,
  exitReason: null,
  lastSeenAt: new Date().toISOString(),
}));
vi.mock('@shared/api/client', () => ({
  api: { logs: () => Promise.resolve({ data: rows, nextCursor: null }) },
}));
vi.mock('@shared/hooks/useAreas', () => ({ useAreas: () => ({ areas: [] }) }));
vi.mock('@shared/realtime/socket', () => ({
  getSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }),
}));
// Her satır bir levha çizer: çağrı sayısı tablonun kaç kez çizildiğini gösterir.
const signRenders = vi.hoisted(() => vi.fn());
vi.mock('@shared/zones/SignIcon', () => ({
  SignIcon: () => {
    signRenders();
    return null;
  },
}));

const { LogsView } = await import('./LogsView');

describe('LogsView', () => {
  test('filtreye yazmak tabloyu yeniden çizmez; satıra tıklamak kullanıcı filtresini doldurur', async () => {
    render(<LogsView />);
    await screen.findByText('scooter-0');
    const input = screen.getByPlaceholderText('scooter-42');
    const drawn = signRenders.mock.calls.length;
    expect(drawn).toBeGreaterThanOrEqual(rows.length);

    for (const text of ['s', 'sc', 'sco']) {
      act(() => void fireEvent.change(input, { target: { value: text } }));
    }
    expect(input).toHaveProperty('value', 'sco');
    expect(signRenders).toHaveBeenCalledTimes(drawn);

    act(() => void fireEvent.click(screen.getByText('scooter-2')));
    expect(input).toHaveProperty('value', 'scooter-2');
    expect(signRenders).toHaveBeenCalledTimes(drawn);
  });
});
