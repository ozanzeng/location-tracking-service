// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Scooter } from '@shared/api/types';
import { FleetTable } from './FleetTable';

const scooters: Scooter[] = [
  {
    id: 'scooter-01',
    name: 'Scooter 01',
    status: 'IN_USE',
    lastSeenAt: null,
    rider: { username: 'ali', since: '2026-09-28T10:00:00.000Z' },
  },
  { id: 'scooter-02', name: 'Scooter 02', status: 'AVAILABLE', lastSeenAt: null, rider: null },
];

describe('FleetTable', () => {
  test('kullanımdaki scooter silinemez; kimde olduğu görünür', () => {
    render(<FleetTable scooters={scooters} removing={null} onRemove={vi.fn()} />);
    expect(screen.getByText('Kullanımda: ali')).toBeTruthy();
    const [busyDelete] = screen.getAllByRole('button', { name: 'Sil' });
    expect(busyDelete).toHaveProperty('disabled', true);
  });

  test('silme sayfa içinde onay ister; vazgeçilebilir', () => {
    const onRemove = vi.fn();
    render(<FleetTable scooters={scooters} removing={null} onRemove={onRemove} />);
    const del = screen.getAllByRole('button', { name: 'Sil' })[1];

    fireEvent.click(del);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(onRemove).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));
    expect(onRemove).toHaveBeenCalledWith('scooter-02');
  });
});
