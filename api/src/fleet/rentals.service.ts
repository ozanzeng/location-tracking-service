import { PgErrorCode } from '../common/database/pg-error-code.enum.js';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import type { RiderPrincipal } from '../security/principal.js';
import type { RentalResponseDto } from './dto/rental-response.dto.js';
import { FleetEvents } from './fleet-events.js';
import { FleetChange } from './fleet-change.enum.js';
import { RentalCache } from './rental-cache.js';
import { RentalEndReason } from './rental-end-reason.enum.js';

interface RentalRow {
  scooter_id: string;
  started_at: Date;
  ended_at: Date | null;
  end_reason: RentalEndReason | null;
}

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

  /** Sürüşü bitirir, scooter boşa çıkar. */
  async end(rider: RiderPrincipal): Promise<RentalResponseDto> {
    const [rows]: [RentalRow[], number] = await this.dataSource.query(
      `UPDATE rentals SET ended_at = now(), end_reason = $2
        WHERE rider_id = $1 AND ended_at IS NULL
       RETURNING scooter_id, started_at, ended_at, end_reason`,
      [rider.riderId, RentalEndReason.RETURNED],
    );
    const [row] = rows;
    if (!row) throw new NotFoundException('Aktif kiralama yok');
    await this.cache.set(rider.riderId, null);
    this.events.publish({
      change: FleetChange.RENTALS,
      scooterId: row.scooter_id,
    });
    return toDto(row);
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
