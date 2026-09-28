import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { isRider } from '../security/principal.js';
import type { AreaType } from '../areas/area-type.enum.js';
import { DeviceLog } from './device-log.js';
import type { CreateScooterDto } from './dto/create-scooter.dto.js';
import type { ScooterDetailDto } from './dto/scooter-detail.dto.js';
import type { RentalEndReason } from './rental-end-reason.enum.js';
import type { ScooterResponseDto } from './dto/scooter-response.dto.js';
import { FleetEvents } from './fleet-events.js';
import { FleetChange } from './fleet-change.enum.js';
import { ScooterRegistry } from './scooter-registry.js';
import { ScooterStatus } from './scooter-status.enum.js';
import type { ScooterRow } from './fleet.types.js';
import type { Principal } from '../security/security.types.js';

@Injectable()
export class ScootersService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly registry: ScooterRegistry,
    private readonly events: FleetEvents,
    private readonly deviceLog: DeviceLog,
  ) {}

  /**
   * Durumuyla filo. Sürücü kimin kullandığını görmez, sadece boşta mı ve kendisinin mi olduğunu;
   * operasyon (API anahtarı) kullanıcı adını ve kiralamanın başladığı anı da görür.
   */
  async list(viewer: Principal | undefined): Promise<ScooterResponseDto[]> {
    const rows: ScooterRow[] = await this.dataSource.query(
      `SELECT s.id, s.name, r.rider_id, rd.username, r.started_at AS rented_since,
              u.recorded_at AS last_seen_at
         FROM scooters s
         LEFT JOIN rentals r ON r.scooter_id = s.id AND r.ended_at IS NULL
         LEFT JOIN riders rd ON rd.id = r.rider_id
         LEFT JOIN user_last_location u ON u.user_id = s.id
        WHERE s.deleted_at IS NULL
        ORDER BY s.id`,
    );
    return rows.map((row) => {
      const dto: ScooterResponseDto = {
        id: row.id,
        name: row.name,
        status: row.rider_id ? ScooterStatus.IN_USE : ScooterStatus.AVAILABLE,
        lastSeenAt: row.last_seen_at?.toISOString() ?? null,
      };
      if (isRider(viewer)) {
        dto.mine = row.rider_id === viewer.riderId;
      } else {
        dto.rider =
          row.rider_id && row.username && row.rented_since
            ? { username: row.username, since: row.rented_since.toISOString() }
            : null;
      }
      return dto;
    });
  }

  /**
   * Operasyon için tek scooter'ın her şeyi. Filodan çıkarılmış ya da hiç kayıtlı olmamış bir
   * kimlik de (eski giriş kayıtlarında görünür) konumu varsa döner; ikisi de yoksa 404.
   */
  async detail(id: string): Promise<ScooterDetailDto> {
    const [[scooter], [location], areas, rentals, deviceLog] =
      await Promise.all([
        this.dataSource.query(
          `SELECT s.id, s.name, s.deleted_at, r.started_at AS rented_since, rd.username
           FROM scooters s
           LEFT JOIN rentals r ON r.scooter_id = s.id AND r.ended_at IS NULL
           LEFT JOIN riders rd ON rd.id = r.rider_id
          WHERE s.id = $1`,
          [id],
        ) as Promise<
          Array<{
            name: string;
            deleted_at: Date | null;
            rented_since: Date | null;
            username: string | null;
          }>
        >,
        this.dataSource.query(
          `SELECT lat, lng, recorded_at FROM user_last_location WHERE user_id = $1`,
          [id],
        ) as Promise<Array<{ lat: number; lng: number; recorded_at: Date }>>,
        this.dataSource.query(
          `SELECT a.id, a.name, a.type, l.entry_time
           FROM area_logs l JOIN areas a ON a.id = l.area_id
          WHERE l.user_id = $1 AND l.exit_time IS NULL
          ORDER BY l.entry_time`,
          [id],
        ) as Promise<
          Array<{ id: string; name: string; type: AreaType; entry_time: Date }>
        >,
        this.dataSource.query(
          `SELECT rd.username, r.started_at, r.ended_at, r.end_reason
           FROM rentals r JOIN riders rd ON rd.id = r.rider_id
          WHERE r.scooter_id = $1
          ORDER BY r.started_at DESC
          LIMIT 10`,
          [id],
        ) as Promise<
          Array<{
            username: string;
            started_at: Date;
            ended_at: Date | null;
            end_reason: RentalEndReason | null;
          }>
        >,
        // Redis erişilemezse detay yine açılır, günlük boş görünür.
        this.deviceLog.read(id).catch(() => []),
      ]);
    if (!scooter && !location)
      throw new NotFoundException('Scooter bulunamadı');
    const registered = Boolean(scooter && !scooter.deleted_at);
    return {
      id,
      registered,
      name: scooter?.name ?? null,
      removedAt: scooter?.deleted_at?.toISOString() ?? null,
      status: registered
        ? scooter.rented_since
          ? ScooterStatus.IN_USE
          : ScooterStatus.AVAILABLE
        : null,
      rider:
        scooter?.rented_since && scooter.username
          ? {
              username: scooter.username,
              since: scooter.rented_since.toISOString(),
            }
          : null,
      lastLocation: location
        ? {
            lat: location.lat,
            lng: location.lng,
            recordedAt: location.recorded_at.toISOString(),
          }
        : null,
      currentAreas: areas.map((a) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        since: a.entry_time.toISOString(),
      })),
      rentals: rentals.map((r) => ({
        username: r.username,
        startedAt: r.started_at.toISOString(),
        endedAt: r.ended_at?.toISOString() ?? null,
        endReason: r.end_reason,
      })),
      deviceLog,
    };
  }

  /**
   * Yeni scooter. Aynı kimlikle silinmiş bir scooter varsa geri getirilir (geçmişi onunla
   * birlikte); aktif bir scooter varsa 409.
   */
  async create(dto: CreateScooterDto): Promise<ScooterResponseDto> {
    const [row]: Array<{ id: string; name: string }> =
      await this.dataSource.query(
        `INSERT INTO scooters (id, name) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL
           WHERE scooters.deleted_at IS NOT NULL
         RETURNING id, name`,
        [dto.id, dto.name ?? dto.id],
      );
    if (!row) throw new ConflictException('Bu kimlikle bir scooter zaten var');
    this.changed(row.id, true);
    return {
      id: row.id,
      name: row.name,
      status: ScooterStatus.AVAILABLE,
      lastSeenAt: null,
      rider: null,
    };
  }

  /**
   * Yumuşak silme; kullanımdaki scooter silinemez. Satır kilitlenir: aynı anda başlayan bir
   * kiralama (RentalsService.rent, FOR SHARE) ya önce biter ve burada görülür ya da silme
   * bittikten sonra scooter'ı silinmiş bulur.
   */
  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const [scooter] = await manager.query(
        `SELECT id FROM scooters WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [id],
      );
      if (!scooter) throw new NotFoundException('Scooter bulunamadı');
      const [rental] = await manager.query(
        `SELECT 1 FROM rentals WHERE scooter_id = $1 AND ended_at IS NULL`,
        [id],
      );
      if (rental) {
        throw new ConflictException(
          'Scooter kullanımda; sürüş bitince silinebilir',
        );
      }
      await manager.query(
        `UPDATE scooters SET deleted_at = now() WHERE id = $1`,
        [id],
      );
    });
    this.changed(id, false);
  }

  private changed(id: string, added: boolean): void {
    if (added) this.registry.added(id);
    else this.registry.removed(id);
    this.events.publish({ change: FleetChange.SCOOTERS, scooterId: id });
  }
}
