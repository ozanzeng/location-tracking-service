// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { Area } from '@shared/api/types';

vi.mock('@shared/zones/SignIcon', () => ({ SignIcon: () => null }));
const { AreaList } = await import('./AreaList');

const square = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [29.02, 40.98],
      [29.03, 40.98],
      [29.03, 40.99],
      [29.02, 40.98],
    ],
  ],
};
const areas: Area[] = [
  { id: 'a1', name: 'Moda', type: 'NO_RIDE', geometry: square, createdAt: 't' },
  { id: 'a2', name: 'Park', type: 'PARKING', geometry: square, createdAt: 't' },
];

describe('AreaList', () => {
  test('silme sayfa içinde onay ister; vazgeçilebilir', () => {
    const onDelete = vi.fn();
    render(<AreaList areas={areas} error={null} editingId={null} busy={false} onEdit={vi.fn()} onDelete={onDelete} />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[1]);
    expect(screen.getByText(/girişleri kapatılır/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole('button', { name: 'Sil' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Evet, sil' }));
    expect(onDelete).toHaveBeenCalledWith(areas[1]);
  });

  test('düzenleme ya da çizim sürerken işlem düğmeleri kapalı; düzenlenen alan işaretli', () => {
    const onEdit = vi.fn();
    render(<AreaList areas={areas} error={null} editingId="a1" busy onEdit={onEdit} onDelete={vi.fn()} />);
    for (const button of screen.getAllByRole('button')) expect(button).toHaveProperty('disabled', true);
    expect(screen.getByText('Moda').closest('li')?.getAttribute('aria-current')).toBe('true');
  });
});
