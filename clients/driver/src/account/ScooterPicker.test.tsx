// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ApiError } from '@shared/api/client';
import type { Scooter } from '@shared/api/types';

const scooters = vi.fn<() => Promise<Scooter[]>>();
const rent = vi.fn();
vi.mock('@shared/api/client', async (original) => ({
  ...(await original<typeof import('@shared/api/client')>()),
  api: { scooters: () => scooters(), rent: (id: string) => rent(id) },
}));
vi.mock('@shared/realtime/socket', () => ({
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

const { ScooterPicker } = await import('./ScooterPicker');

const scooter = (id: string, status: Scooter['status']): Scooter => ({
  id,
  name: id,
  status,
  lastSeenAt: null,
  mine: false,
});

describe('ScooterPicker', () => {
  beforeEach(() => {
    scooters.mockReset();
    rent.mockReset();
  });

  test('kullanımdaki scooter seçilemez; boştaki seçilince kiralanır', async () => {
    scooters.mockResolvedValue([scooter('scooter-01', 'IN_USE'), scooter('scooter-02', 'AVAILABLE')]);
    rent.mockResolvedValue({ scooterId: 'scooter-02', startedAt: 't', endedAt: null, endReason: null });
    const onRented = vi.fn();
    render(<ScooterPicker notice={null} onRented={onRented} />);

    const busy = await screen.findByRole('button', { name: /scooter-01.*Kullanımda/ });
    expect(busy).toHaveProperty('disabled', true);
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: /scooter-02.*Boşta/ })));
    expect(rent).toHaveBeenCalledWith('scooter-02');
    expect(onRented).toHaveBeenCalledWith(expect.objectContaining({ scooterId: 'scooter-02' }));
  });

  test('hepsi kullanımdaysa "Boşta scooter yok" der', async () => {
    scooters.mockResolvedValue([1, 2, 3, 4, 5].map((i) => scooter(`scooter-0${i}`, 'IN_USE')));
    render(<ScooterPicker notice={null} onRented={vi.fn()} />);
    expect(await screen.findByText('Boşta scooter yok')).toBeTruthy();
    expect(screen.getByText(/5 scooter'ın hepsi kullanımda/)).toBeTruthy();
  });

  test('başka sürücü aynı anda aldıysa (409) sebebi gösterir ve listeyi yeniler', async () => {
    scooters.mockResolvedValue([scooter('scooter-03', 'AVAILABLE')]);
    rent.mockRejectedValue(new ApiError('Bu scooter kullanımda', 409, null, null));
    render(<ScooterPicker notice={null} onRented={vi.fn()} />);
    const button = await screen.findByRole('button', { name: /scooter-03/ });
    const calls = scooters.mock.calls.length;
    await act(async () => void fireEvent.click(button));
    expect(screen.getByRole('alert').textContent).toMatch(/kullanımda/);
    expect(scooters.mock.calls.length).toBeGreaterThan(calls);
  });
});
