import type { DataSource } from 'typeorm';
import { loadConfig } from '../config/configuration.js';
import type { LocationLanes } from '../queue/location-lanes.js';
import type { GeofenceRepository } from './geofence.repository.js';
import { SignalLossSweeper } from './signal-loss.sweeper.js';

/** Veritabanı sorgusu elle çözülür: süren bir aramayı taklit etmek için. */
const setup = (env: Record<string, string> = {}, pendingMs = 0) => {
  const pending: Array<(rows: unknown[]) => void> = [];
  const dataSource = {
    query: vi.fn(
      () => new Promise<unknown[]>((resolve) => pending.push(resolve)),
    ),
    transaction: vi.fn(),
  };
  const lanes = { oldestPendingAgeMs: vi.fn(async () => pendingMs) };
  const sweeper = new SignalLossSweeper(
    dataSource as unknown as DataSource,
    {} as GeofenceRepository,
    lanes as unknown as LocationLanes,
    loadConfig({ SIGNAL_LOSS_SWEEP_MS: '1000', ...env }),
  );
  return { sweeper, dataSource, pending };
};

describe('SignalLossSweeper zamanlaması', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('SIGNAL_LOSS_TIMEOUT_MS=0 ise hiç aramaz', async () => {
    const { sweeper, dataSource } = setup({ SIGNAL_LOSS_TIMEOUT_MS: '0' });
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dataSource.query).not.toHaveBeenCalled();
    await sweeper.onModuleDestroy();
  });

  it('arama sürerken yenisi başlamaz; kapanış süren aramanın bitmesini bekler', async () => {
    const { sweeper, dataSource, pending } = setup();
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(1000);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    // Veritabanı yavaş: sonraki turlar üst üste binmez.
    await vi.advanceTimersByTimeAsync(3000);
    expect(dataSource.query).toHaveBeenCalledTimes(1);

    let closed = false;
    const destroyed = sweeper.onModuleDestroy().then(() => (closed = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(closed).toBe(false);
    pending[0]([]);
    await destroyed;
    // Kapandıktan sonra yeni arama yok.
    await vi.advanceTimersByTimeAsync(5000);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('kuyrukta bekleyen en eski işin yaşı kadar ek pay bırakır', async () => {
    const { sweeper, dataSource } = setup({}, 45_000);
    dataSource.query.mockResolvedValue([]);
    await sweeper.sweep();
    // 30 sn + kuyrukta 45 sn bekleyen iş: 75 sn'den uzun sessiz olanlar.
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.any(String),
      [75, 500],
    );
  });

  it('başarısız arama süreci düşürmez, sonraki turda tekrar dener', async () => {
    const { sweeper, dataSource } = setup();
    dataSource.query.mockRejectedValueOnce(new Error('bağlantı yok'));
    dataSource.query.mockResolvedValue([]);
    sweeper.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(2000);
    expect(dataSource.query).toHaveBeenCalledTimes(2);
    await sweeper.onModuleDestroy();
  });
});
