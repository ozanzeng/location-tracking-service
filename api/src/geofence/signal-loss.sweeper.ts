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
import { SIGNAL_LOSS_BATCH as SWEEP_BATCH } from '../config/limits.js';
import { ExitReason } from '../logs/exit-reason.enum.js';
import { signalLostVisits } from '../metrics/metrics.js';
import { LocationLanes } from '../queue/location-lanes.js';
import { GeofenceRepository } from './geofence.repository.js';

/**
 * Konum göndermeyi bırakan kullanıcının açık girişleri "içeride" kalmasın:
 * SIGNAL_LOSS_TIMEOUT_MS (varsayılan 30 sn) boyunca konumu gelmeyen kullanıcının açık
 * girişleri kapatılır. Çıkış zamanı kapatıldığı andır ve kayıt "sinyal kesildi" olarak
 * işaretlenir (exit_reason = SIGNAL_LOST). Kullanıcı aynı alanda yeniden konum gönderirse yeni bir giriş açılır.
 *
 * - Sessizlik sunucunun konumu işlediği ana (seen_at) göre ölçülür, cihaz saatine göre değil:
 *   saati geride olan cihaz, konum gönderirken sessiz sayılmaz.
 * - Yük altında konumlar kuyrukta bekleyebilir. Arama, en eski bekleyen işin yaşı kadar ek pay
 *   bırakır: konumu kuyrukta bekleyen kullanıcının girişi kapanıp yeniden açılmaz.
 * - Her kullanıcı, konum işlemeyle aynı kullanıcı kilidi altında kapatılır ve sessizlik kilit
 *   altında yeniden kontrol edilir: tam o sırada işlenen konum kaydı kapattırmaz.
 * - Her worker süreci arar; aynı kullanıcıyı ikinci kez kapatacak açık giriş kalmaz.
 */
@Injectable()
export class SignalLossSweeper
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SignalLossSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<number> | null = null;
  private stopped = false;
  /** Art arda başarısız aramalarda (ör. veritabanı kapalı) her seferinde uyarı basılmasın. */
  private failing = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly repository: GeofenceRepository,
    private readonly lanes: LocationLanes,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const { signalLossTimeoutMs, signalLossSweepMs } = this.config.worker;
    if (signalLossTimeoutMs === 0) return;
    this.timer = setInterval(() => void this.tick(), signalLossSweepMs);
  }

  /** Yeni arama başlamaz; süren arama (kısa transaction'lar) bitirilir. */
  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  private async tick(): Promise<void> {
    // Önceki arama bitmediyse (ör. veritabanı yavaş) üst üste binmesin.
    if (this.running) return;
    this.running = this.sweep();
    try {
      await this.running;
      if (this.failing)
        this.logger.log('Sinyal kaybı araması yeniden çalışıyor');
      this.failing = false;
    } catch (err) {
      if (!this.failing) {
        this.logger.warn(
          `Sinyal kaybı araması başarısız: ${(err as Error).message}`,
        );
      }
      this.failing = true;
    } finally {
      this.running = null;
    }
  }

  /** Sessiz kullanıcıların açık girişlerini kapatır; kapatılan giriş sayısını döner. */
  async sweep(): Promise<number> {
    const pendingMs = await this.lanes.oldestPendingAgeMs();
    const silentSeconds =
      (this.config.worker.signalLossTimeoutMs + pendingMs) / 1000;
    let closed = 0;
    for (;;) {
      const users: Array<{ user_id: string }> = await this.dataSource.query(
        `SELECT DISTINCT v.user_id
           FROM area_logs v
           JOIN user_last_location l ON l.user_id = v.user_id
          WHERE v.exit_time IS NULL
            AND l.seen_at < now() - make_interval(secs => $1)
          LIMIT $2`,
        [silentSeconds, SWEEP_BATCH],
      );
      for (const { user_id } of users) {
        if (this.stopped) return closed;
        closed += await this.closeIfSilent(user_id, silentSeconds);
      }
      if (users.length < SWEEP_BATCH) break;
    }
    if (closed > 0) {
      signalLostVisits.inc(closed);
      this.logger.log(`Sinyali kesilen ${closed} giriş kapatıldı`);
    }
    return closed;
  }

  private closeIfSilent(
    userId: string,
    silentSeconds: number,
  ): Promise<number> {
    return this.dataSource.transaction(async (manager) => {
      await this.repository.lockUser(manager, userId);
      // Çıkış zamanı kapatıldığı an (giriş cihaz saatiyle ileride olabilir: ondan önce olamaz).
      // CTE: TypeORM UPDATE için satırlar yerine [satırlar, sayı] döndürür.
      const [{ closed }]: Array<{ closed: number }> = await manager.query(
        `WITH closed AS (
           UPDATE area_logs v
              SET exit_time = GREATEST(now(), v.entry_time), exit_reason = $3
             FROM user_last_location l
            WHERE v.user_id = $1 AND v.exit_time IS NULL
              AND l.user_id = v.user_id
              AND l.seen_at < now() - make_interval(secs => $2)
           RETURNING v.id
         )
         SELECT count(*)::int AS closed FROM closed`,
        [userId, silentSeconds, ExitReason.SIGNAL_LOST],
      );
      return closed;
    });
  }
}
