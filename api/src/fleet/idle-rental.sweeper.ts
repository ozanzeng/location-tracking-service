import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { idleRentalsEnded } from '../metrics/metrics.js';
import { LocationLanes } from '../queue/location-lanes.js';
import { FleetChange } from './fleet-change.enum.js';
import { FleetEvents } from './fleet-events.js';
import { RentalCache } from './rental-cache.js';
import { RentalEndReason } from './rental-end-reason.enum.js';

/**
 * Unutulan kiralama: RENTAL_IDLE_TIMEOUT_MS (varsayılan 10 dk) boyunca scooter'dan konum
 * gelmezse kiralama biter ve scooter başka sürücülere açılır. Sürüşü bitirmeden uygulamayı
 * kapatan sürücü scooter'ı kilitli bırakamaz.
 *
 * - Sessizlik girişlerdeki gibi sunucu saatiyle ölçülür: son konumun işlendiği an (seen_at),
 *   hiç konum yoksa kiralamanın başladığı an. Kuyrukta bekleyen en eski işin yaşı kadar pay
 *   bırakılır (SignalLossSweeper ile aynı).
 * - Girişlerin süresinden (SIGNAL_LOSS_TIMEOUT_MS, 30 sn) uzundur: tünel ya da kısa ağ
 *   kopmasında giriş kapanıp yeniden açılabilir, ama sürücü scooter'ını kaybetmez.
 * - Kiralama son sinyal anıyla biter (end_reason = SIGNAL_LOST); sürücünün önbellekteki
 *   kiralaması silinir, filoya duyurulur (sürücü uygulaması fark eder, seçim ekranı yenilenir).
 * - Her worker çalıştırır; UPDATE ... WHERE ended_at IS NULL bir kiralamayı bir kez bitirir.
 */
@Injectable()
export class IdleRentalSweeper
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(IdleRentalSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lanes: LocationLanes,
    private readonly cache: RentalCache,
    private readonly events: FleetEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const { rentalIdleTimeoutMs, signalLossSweepMs } = this.config.worker;
    if (rentalIdleTimeoutMs === 0) return;
    this.timer = setInterval(() => this.tick(), signalLossSweepMs);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** Bir önceki tur bitmediyse atlanır. */
  private tick(): void {
    if (this.running) return;
    this.running = this.sweep()
      .catch((err: Error) =>
        this.logger.warn(`Sessiz kiralama araması başarısız: ${err.message}`),
      )
      .finally(() => {
        this.running = null;
      });
  }

  /** Sessiz kiralamaları bitirir; biten kiralama sayısını döner. */
  async sweep(): Promise<number> {
    const pendingMs = await this.lanes.oldestPendingAgeMs();
    const silentSeconds =
      (this.config.worker.rentalIdleTimeoutMs + pendingMs) / 1000;
    const [rows]: [Array<{ rider_id: string; scooter_id: string }>, number] =
      await this.dataSource.query(
        `UPDATE rentals r
            SET ended_at = s.last_signal, end_reason = $2
           FROM (SELECT r2.id, greatest(r2.started_at, u.seen_at) AS last_signal
                   FROM rentals r2
                   LEFT JOIN user_last_location u ON u.user_id = r2.scooter_id
                  WHERE r2.ended_at IS NULL) s
          WHERE r.id = s.id AND r.ended_at IS NULL
            AND s.last_signal < now() - make_interval(secs => $1)
         RETURNING r.rider_id, r.scooter_id`,
        [silentSeconds, RentalEndReason.SIGNAL_LOST],
      );
    if (rows.length === 0) return 0;
    idleRentalsEnded.inc(rows.length);
    this.logger.log(`Sessiz kalan ${rows.length} kiralama bitirildi`);
    await this.cache.clear(rows.map((r) => r.rider_id));
    for (const row of rows) {
      this.events.publish({
        change: FleetChange.RENTALS,
        scooterId: row.scooter_id,
      });
    }
    return rows.length;
  }
}
