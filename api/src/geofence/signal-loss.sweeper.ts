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
import { SIGNAL_LOSS_BATCH } from '../config/limits.js';
import { FleetEvents } from '../fleet/fleet-events.js';
import { FleetChange } from '../fleet/fleet-change.enum.js';
import { RentalCache } from '../fleet/rental-cache.js';
import { RentalEndReason } from '../fleet/rental-end-reason.enum.js';
import { signalLosses } from '../metrics/metrics.js';
import { SignalLossKind } from '../metrics/signal-loss-kind.enum.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import type { AreaType } from '../areas/area-type.enum.js';
import { AreaEventType } from './area-event-type.enum.js';
import { ExitReason } from './exit-reason.enum.js';

interface ClosedVisit {
  id: string;
  area_id: string;
  name: string;
  type: AreaType;
  lat: number;
  lng: number;
  recorded_at: Date;
}

export interface SweepResult {
  closedVisits: number;
  endedRentals: number;
}

/**
 * Sinyal kaybı: SIGNAL_LOSS_TIMEOUT_MS boyunca konum göndermeyen scooter'lar.
 *
 * - Açık giriş kayıtları son sinyal anıyla kapatılır ve exit_reason = SIGNAL_LOST ile
 *   işaretlenir. Aksi halde pili biten ya da uygulaması kapanan cihaz sonsuza kadar
 *   "içeride" görünürdü. Kullanıcı kilidi (GeofenceService'in aldığı advisory lock) alındığı
 *   için aynı anda işlenen bir konumla yarışmaz. Cihaz sonra dönerse (ya da çevrimdışı biriken konumları
 *   gelirse) içindeki alanlar için yeni giriş açılır; kapanan kaydın işaretinden aradaki
 *   boşluğun sinyal kaybı olduğu anlaşılır.
 * - Aktif kiralamalar son sinyal anıyla (hiç konum yoksa başlangıç anıyla) biter ve scooter
 *   boşa çıkar: sürüşü bitirmeden uygulamayı kapatan sürücü scooter'ı kilitli bırakmasın.
 *
 * Her worker çalıştırır; ayrıca lider seçimi gerekmez: iki worker aynı anda tarasa da bir kayıt
 * bir kez kapanır (UPDATE ... WHERE exit_time IS NULL / ended_at IS NULL), olay bir kez yayınlanır.
 */
@Injectable()
export class SignalLossSweeper
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(SignalLossSweeper.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<unknown> | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publisher: RealtimePublisher,
    private readonly rentalCache: RentalCache,
    private readonly fleetEvents: FleetEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const { signalLossTimeoutMs, signalLossCheckMs } = this.config.worker;
    if (signalLossTimeoutMs === 0) return;
    this.timer = setInterval(() => this.tick(), signalLossCheckMs);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }

  /** Bir önceki tur bitmediyse atlanır (veritabanı yavaşken turlar üst üste binmesin). */
  private tick(): void {
    if (this.running) return;
    this.running = this.sweep()
      .catch((err: Error) =>
        this.logger.warn(`Sinyal kaybı taraması başarısız: ${err.message}`),
      )
      .finally(() => {
        this.running = null;
      });
  }

  async sweep(now = new Date()): Promise<SweepResult> {
    const cutoff = new Date(
      now.getTime() - this.config.worker.signalLossTimeoutMs,
    );
    const closedVisits = await this.closeVisits(cutoff);
    const endedRentals = await this.endRentals(cutoff);
    if (closedVisits + endedRentals > 0) {
      this.logger.log({
        message: 'Sinyali kesilen scooterlar kapatıldı',
        closedVisits,
        endedRentals,
      });
    }
    return { closedVisits, endedRentals };
  }

  /**
   * Birikmiş iş (ör. toplu kesinti ya da ilk açılış) tek turda erir: 500'lük gruplar halinde,
   * tur süresinin yarısı dolana kadar devam edilir. Başka bir worker'ın ya da o an işlenen bir
   * konumun kilitlediği kullanıcı beklenmeden atlanır; sonraki turda tekrar bakılır.
   */
  private async closeVisits(cutoff: Date): Promise<number> {
    const deadline = Date.now() + this.config.worker.signalLossCheckMs / 2;
    let closed = 0;
    for (;;) {
      // Açık girişler kısmi index'ten (exit_time IS NULL) okunur; tablo taranmaz.
      const users: Array<{ user_id: string }> = await this.dataSource.query(
        `SELECT DISTINCT l.user_id
           FROM area_logs l
           JOIN user_last_location u ON u.user_id = l.user_id
          WHERE l.exit_time IS NULL AND u.recorded_at < $1
          LIMIT ${SIGNAL_LOSS_BATCH}`,
        [cutoff],
      );
      let closedInBatch = 0;
      for (const { user_id: userId } of users) {
        closedInBatch += await this.closeVisitsOf(userId, cutoff);
      }
      closed += closedInBatch;
      // Grup dolu değilse iş bitti; hiçbiri kapanmadıysa kalanlar başkasının elinde.
      if (
        users.length < SIGNAL_LOSS_BATCH ||
        closedInBatch === 0 ||
        Date.now() > deadline
      ) {
        return closed;
      }
    }
  }

  private async closeVisitsOf(userId: string, cutoff: Date): Promise<number> {
    const visits = await this.dataSource.transaction(
      async (manager): Promise<ClosedVisit[]> => {
        // Kilit o an başkasındaysa (konumu işleniyor ya da başka worker kapatıyor) beklenmez.
        const [{ locked }]: Array<{ locked: boolean }> = await manager.query(
          `SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked`,
          [userId],
        );
        if (!locked) return [];
        // Aday seçildikten sonra yeni bir konum işlendiyse son sinyal artık eski değildir.
        return manager.query(
          `WITH closed AS (
             UPDATE area_logs l
                SET exit_time = u.recorded_at, exit_reason = $3
               FROM user_last_location u
              WHERE l.user_id = $1 AND l.exit_time IS NULL
                AND u.user_id = l.user_id AND u.recorded_at < $2
             RETURNING l.id, l.area_id, u.lat, u.lng, u.recorded_at
           )
           SELECT c.*, a.name, a.type FROM closed c JOIN areas a ON a.id = c.area_id`,
          [userId, cutoff, ExitReason.SIGNAL_LOST],
        );
      },
    );
    if (visits.length === 0) return 0;
    signalLosses.inc({ kind: SignalLossKind.VISIT }, visits.length);
    const recordedAt = visits[0].recorded_at.toISOString();
    await this.publisher.publish({
      position: {
        userId,
        lat: visits[0].lat,
        lng: visits[0].lng,
        recordedAt,
        areas: [],
      },
      events: visits.map((v) => ({
        logId: v.id,
        userId,
        eventType: AreaEventType.EXIT,
        area: { id: v.area_id, name: v.name, type: v.type },
        occurredAt: recordedAt,
      })),
    });
    return visits.length;
  }

  private async endRentals(cutoff: Date): Promise<number> {
    const [rows]: [Array<{ rider_id: string; scooter_id: string }>, number] =
      await this.dataSource.query(
        `UPDATE rentals r
            SET ended_at = s.last_signal, end_reason = $2
           FROM (SELECT r2.id, greatest(r2.started_at, u.recorded_at) AS last_signal
                   FROM rentals r2
                   LEFT JOIN user_last_location u ON u.user_id = r2.scooter_id
                  WHERE r2.ended_at IS NULL) s
          WHERE r.id = s.id AND r.ended_at IS NULL AND s.last_signal < $1
         RETURNING r.rider_id, r.scooter_id`,
        [cutoff, RentalEndReason.SIGNAL_LOST],
      );
    if (rows.length === 0) return 0;
    signalLosses.inc({ kind: SignalLossKind.RENTAL }, rows.length);
    await this.rentalCache.clear(rows.map((r) => r.rider_id));
    for (const row of rows) {
      this.fleetEvents.publish({
        change: FleetChange.RENTALS,
        scooterId: row.scooter_id,
      });
    }
    return rows.length;
  }
}
