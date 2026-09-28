// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { LogEntry } from '@shared/api/types';

vi.mock('@shared/zones/SignIcon', () => ({ SignIcon: () => null }));
const { LogsTable } = await import('./LogsTable');

const NOW = Date.parse('2026-09-28T12:00:00Z');
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();
const entry = (userId: string, fields: Partial<LogEntry>): LogEntry => ({
  id: userId,
  userId,
  areaId: 'park',
  areaName: 'Park',
  areaType: 'PARKING',
  entryTime: ago(3600),
  exitTime: null,
  exitReason: null,
  lastSeenAt: null,
  ...fields,
});
const rowOf = (userId: string) => screen.getByText(userId).closest('tr')!.textContent;

describe('LogsTable çıkış durumu', () => {
  test('konum gönderen içeride; 60 sn\'dir sessiz olan "sinyal yok"; zaman geçtikçe güncellenir', () => {
    const rows = [entry('aktif', { lastSeenAt: ago(5) }), entry('sessiz', { lastSeenAt: ago(300) })];
    const { rerender } = render(<LogsTable rows={rows} now={NOW} onOpenScooter={() => undefined} />);
    expect(rowOf('aktif')).toContain('İçeride');
    expect(rowOf('sessiz')).toContain('Sinyal yok · 5 dk önce');

    rerender(<LogsTable rows={rows} now={NOW + 120_000} onOpenScooter={() => undefined} />);
    expect(rowOf('aktif')).toContain('Sinyal yok · 2 dk önce');
    expect(rowOf('sessiz')).toContain('Sinyal yok · 7 dk önce');
  });

  test('sinyali kesilen kayıt: çıkış zamanı "sinyal kesildi" notuyla', () => {
    const rows = [
      entry('kesildi', { exitTime: ago(1800), exitReason: 'SIGNAL_LOST' }),
      entry('cikti', { exitTime: ago(1800), exitReason: 'LEFT' }),
    ];
    render(<LogsTable rows={rows} now={NOW} onOpenScooter={() => undefined} />);
    expect(rowOf('kesildi')).toContain('sinyal kesildi');
    expect(rowOf('kesildi')).toContain('30 dk 0 sn');
    expect(rowOf('cikti')).not.toContain('sinyal');
    expect(rowOf('cikti')).toContain('30 dk 0 sn');
  });
});
