// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { LogEntry, LogQuery, Scooter, ScooterDetail } from '@shared/api/types';

const rows: LogEntry[] = Array.from({ length: 3 }, (_, i) => ({
  id: `log-${i}`,
  userId: `scooter-${i}`,
  areaId: 'park',
  areaName: 'Park',
  areaType: 'PARKING',
  entryTime: '2026-09-28T10:00:00.000Z',
  exitTime: null,
  exitReason: null,
}));
const scooters: Scooter[] = ['scooter-0', 'scooter-1', 'scooter-2'].map((id) => ({
  id,
  name: id,
  status: 'AVAILABLE',
  lastSeenAt: null,
}));
const detail = (id: string): ScooterDetail => ({
  id,
  registered: true,
  name: id,
  removedAt: null,
  status: 'IN_USE',
  rider: { username: 'ali', since: '2026-09-28T10:00:00.000Z' },
  lastLocation: { lat: 40.98, lng: 29.02, recordedAt: '2026-09-28T10:00:00.000Z' },
  // Panelde alan levhası çizilmesin: levha sayısı tablonun kaç kez çizildiğini ölçüyor.
  currentAreas: [],
  rentals: [],
  deviceLog: [
    {
      receivedAt: '2026-09-28T10:00:00.100Z',
      processedAt: '2026-09-28T10:00:00.200Z',
      recordedAt: '2026-09-28T10:00:00.000Z',
      lat: 40.98,
      lng: 29.02,
      result: 'PROCESSED',
      events: [{ type: 'ENTER', area: { id: 'park', name: 'Park', type: 'PARKING' } }],
    },
  ],
});
const logs = vi.hoisted(() => vi.fn());
vi.mock('@shared/api/client', () => ({
  api: {
    logs: (q: LogQuery) => logs(q),
    scooterDetail: (id: string) => Promise.resolve(detail(id)),
  },
  ApiError: class extends Error {},
}));
vi.mock('@shared/hooks/useAreas', () => ({ useAreas: () => ({ areas: [] }) }));
vi.mock('@shared/hooks/useScooters', () => ({ useScooters: () => ({ scooters }) }));
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
  test('kolon "Scooter"; filtrede kayıtlı scooterlar listelenir; filtre değişince tablo yeniden çizilmez', async () => {
    logs.mockResolvedValue({ data: rows, nextCursor: null });
    render(<LogsView />);
    await screen.findByText('scooter-0');
    expect(screen.getByRole('columnheader', { name: 'Scooter' })).toBeTruthy();
    const select = screen.getByLabelText('Scooter') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', 'scooter-0', 'scooter-1', 'scooter-2']);

    const drawn = signRenders.mock.calls.length;
    expect(drawn).toBeGreaterThanOrEqual(rows.length);
    act(() => void fireEvent.change(select, { target: { value: 'scooter-1' } }));
    expect(select.value).toBe('scooter-1');
    expect(signRenders).toHaveBeenCalledTimes(drawn);
  });

  test("satırdaki scooter'a tıklayınca sağda detay paneli ve cihaz günlüğü açılır; panelden filtrelenir; Esc kapatır", async () => {
    logs.mockResolvedValue({ data: rows, nextCursor: null });
    render(<LogsView />);
    await screen.findByText('scooter-2');
    const drawn = signRenders.mock.calls.length;

    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'scooter-2' })));
    const drawer = screen.getByRole('complementary', { name: /scooter-2/ });
    expect(within(drawer).getByText('Kullanımda: ali')).toBeTruthy();
    expect(within(drawer).getByText('Girdi: Park')).toBeTruthy();
    // Panel açılırken tablo yeniden çizilmez.
    expect(signRenders).toHaveBeenCalledTimes(drawn);

    await act(async () => fireEvent.click(within(drawer).getByRole('button', { name: /giriş kayıtlarını göster/ })));
    expect(logs).toHaveBeenLastCalledWith(expect.objectContaining({ userId: 'scooter-2' }));
    expect((screen.getByLabelText('Scooter') as HTMLSelectElement).value).toBe('scooter-2');

    act(() => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(screen.queryByRole('complementary', { name: /scooter-2/ })).toBeNull();
  });
});
