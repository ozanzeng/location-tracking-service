import { PgErrorCode } from '../common/database/pg-error-code.enum.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, type EntityManager, QueryFailedError } from 'typeorm';
import { AreaType } from '../areas/area-type.enum.js';
import type { EndRentalDto } from './dto/end-rental.dto.js';
import type { RentalResponseDto } from './dto/rental-response.dto.js';
import { FleetEvents } from './fleet-events.js';
import { FleetChange } from './fleet-change.enum.js';
import { RentalCache } from './rental-cache.js';
import { RentalEndReason } from './rental-end-reason.enum.js';
import type { RentalRow, RentalEndPoint, EndSpot } from './fleet.types.js';
import type { RiderPrincipal } from '../security/security.types.js';

const toDto = (row: RentalRow): RentalResponseDto => ({
  scooterId: row.scooter_id,
  startedAt: row.started_at.toISOString(),
  endedAt: row.ended_at?.toISOString() ?? null,
  endReason: row.end_reason,
});

@Injectable()
export class RentalsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly cache: RentalCache,
    private readonly events: FleetEvents,
  ) {}

  /**
   * Scooter'ı kiralar. İki sürücü aynı scooter'a aynı anda basarsa ya da bir sürücü iki
   * scooter almaya çalışırsa veritabanındaki kısmi unique index'ler birini reddeder.
   */
  async rent(
    rider: RiderPrincipal,
    scooterId: string,
  ): Promise<RentalResponseDto> {
    let row: RentalRow;
    try {
      row = await this.dataSource.transaction(async (manager) => {
        // Silme ile yarışmasın (bkz. ScootersService.remove).
        const [scooter] = await manager.query(
          `SELECT id FROM scooters WHERE id = $1 AND deleted_at IS NULL FOR SHARE`,
          [scooterId],
        );
        if (!scooter) throw new NotFoundException('Scooter bulunamadı');
        const [inserted]: RentalRow[] = await manager.query(
          `INSERT INTO rentals (scooter_id, rider_id) VALUES ($1, $2)
           RETURNING scooter_id, started_at, ended_at, end_reason`,
          [scooterId, rider.riderId],
        );
        return inserted;
      });
    } catch (err) {
      throw await this.explainConflict(err, rider);
    }
    await this.cache.set(rider.riderId, scooterId);
    this.events.publish({ change: FleetChange.RENTALS, scooterId });
    return toDto(row);
  }

  /**
   * Sürüşü bitirir, scooter boşa çıkar. Sürüş sadece park alanında biter, park yasak bölgede
   * hiç bitmez (sürücü uygulamasıyla aynı kural; eski ya da hatalı bir istemci kuralı
   * atlayamaz):
   * - Bitiş noktası cihazın gönderdiği konumdur: son konum kuyrukta beklerken sunucudaki son
   *   konum geride kalabilir. Gövdede konum yoksa scooter'ın sunucuda işlenmiş son konumu.
   * - Kiralama boyunca hiç konum işlenmediyse (sürüşe başlanmadı, scooter yerinden oynamadı)
   *   scooter bırakılabilir.
   * Konum sahteciliğine karşı değildir: konumların kendisi de cihazdan gelir (README).
   * Kiralama satırı kilitlenir: aynı anda iki bitirme isteğinden biri 404 alır.
   */
  async end(
    rider: RiderPrincipal,
    at: EndRentalDto = {},
  ): Promise<RentalResponseDto> {
    const claimed =
      at.lat !== undefined && at.lng !== undefined
        ? { lat: at.lat, lng: at.lng }
        : null;
    const row = await this.dataSource.transaction(async (manager) => {
      const [rental]: Array<{
        id: string;
        scooter_id: string;
        started_at: Date;
      }> = await manager.query(
        `SELECT id, scooter_id, started_at FROM rentals
            WHERE rider_id = $1 AND ended_at IS NULL FOR UPDATE`,
        [rider.riderId],
      );
      if (!rental) throw new NotFoundException('Aktif kiralama yok');
      await this.assertCanPark(manager, rental, claimed);
      const [[ended]]: [RentalRow[], number] = await manager.query(
        `UPDATE rentals SET ended_at = now(), end_reason = $2 WHERE id = $1
         RETURNING scooter_id, started_at, ended_at, end_reason`,
        [rental.id, RentalEndReason.RETURNED],
      );
      return ended;
    });
    await this.cache.set(rider.riderId, null);
    this.events.publish({
      change: FleetChange.RENTALS,
      scooterId: row.scooter_id,
    });
    return toDto(row);
  }

  private async assertCanPark(
    manager: EntityManager,
    rental: { scooter_id: string; started_at: Date },
    claimed: RentalEndPoint | null,
  ): Promise<void> {
    // Kiralama başladıktan sonra işlenmiş son konum (öncesi park halindeki konumdur).
    const [last]: RentalEndPoint[] = await manager.query(
      `SELECT lat, lng FROM user_last_location
        WHERE user_id = $1 AND seen_at >= $2`,
      [rental.scooter_id, rental.started_at],
    );
    const spot = claimed ?? last;
    if (!spot) return;
    const [where]: EndSpot[] = await manager.query(
      `WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS g)
       SELECT
         EXISTS (SELECT 1 FROM areas a, p WHERE a.deleted_at IS NULL AND a.type = $3
                  AND ST_Contains(a.geom, p.g)) AS in_parking,
         EXISTS (SELECT 1 FROM areas a, p WHERE a.deleted_at IS NULL AND a.type = $4
                  AND ST_Contains(a.geom, p.g)) AS in_no_parking,
         n.name AS nearest_parking, n.meters AS nearest_meters
       FROM p
       LEFT JOIN LATERAL (
         SELECT a.name, ST_Distance(a.geom::geography, p.g::geography) AS meters
           FROM areas a WHERE a.deleted_at IS NULL AND a.type = $3
          ORDER BY a.geom <-> p.g LIMIT 1) n ON true`,
      [spot.lng, spot.lat, AreaType.PARKING, AreaType.NO_PARKING],
    );
    if (where.in_no_parking) {
      throw new ConflictException(
        'Park yasak bölgede sürüş bitirilemez. Bir park alanına gidin.',
      );
    }
    if (where.in_parking) return;
    throw new ConflictException(
      where.nearest_parking
        ? `Sürüş sadece park alanlarında bitirilebilir. En yakın park alanı: ${where.nearest_parking}, yaklaşık ${Math.max(10, Math.round((where.nearest_meters ?? 0) / 10) * 10)} m.`
        : 'Sürüş sadece park alanlarında bitirilebilir; tanımlı park alanı yok.',
    );
  }

  async current(riderId: string): Promise<RentalResponseDto | null> {
    const [row]: RentalRow[] = await this.dataSource.query(
      `SELECT scooter_id, started_at, ended_at, end_reason
         FROM rentals WHERE rider_id = $1 AND ended_at IS NULL`,
      [riderId],
    );
    return row ? toDto(row) : null;
  }

  /** Konum isteği ve canlı yayın için: sürücünün kiraladığı scooter (önbellekten). */
  activeScooter(riderId: string): Promise<string | null> {
    return this.cache.get(
      riderId,
      async () => (await this.current(riderId))?.scooterId ?? null,
    );
  }

  private async explainConflict(
    err: unknown,
    rider: RiderPrincipal,
  ): Promise<unknown> {
    if (
      !(err instanceof QueryFailedError) ||
      (err.driverError as { code?: string }).code !==
        PgErrorCode.UNIQUE_VIOLATION
    ) {
      return err;
    }
    const constraint = (err.driverError as { constraint?: string }).constraint;
    if (constraint === 'rentals_active_rider_uq') {
      const active = await this.current(rider.riderId);
      return new ConflictException(
        `Zaten bir scooter kullanıyorsunuz${active ? `: ${active.scooterId}` : ''}`,
      );
    }
    return new ConflictException('Bu scooter kullanımda');
  }
}
