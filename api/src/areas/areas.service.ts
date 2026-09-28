import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Polygon } from 'geojson';
import { type EntityManager, Repository } from 'typeorm';
import { AreaEventType } from '../geofence/area-event-type.enum.js';
import { ExitReason } from '../logs/exit-reason.enum.js';
import type { AreaEvent, AreaRef } from '../geofence/geofence.types.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { Area } from './area.entity.js';
import type { CreateAreaDto } from './dto/create-area.dto.js';
import type { UpdateAreaDto } from './dto/update-area.dto.js';
import type { AreaType } from './area-type.enum.js';
import type { ClosedVisit } from './areas.types.js';

@Injectable()
export class AreasService {
  constructor(
    @InjectRepository(Area) private readonly areas: Repository<Area>,
    private readonly publisher: RealtimePublisher,
  ) {}

  async create(dto: CreateAreaDto): Promise<Area> {
    await this.assertValidPolygon(dto.geometry);
    const area = this.areas.create({
      name: dto.name,
      type: dto.type,
      geom: dto.geometry,
    });
    const saved = await this.areas.save(area);
    // Açık istemciler (sürücü, operasyon) yeni alanı sayfa yenilemeden görsün. Yanıt
    // yayını beklemez: alan kaydedildi; Redis erişilemezse istek asılı kalıp istemcinin
    // tekrar denemesiyle aynı alan ikinci kez oluşmasın. Yayın hatası publisher'da loglanır.
    void this.publisher.publishAreasChanged({ created: this.ref(saved) });
    return saved;
  }

  findAll(type?: AreaType): Promise<Area[]> {
    return this.areas.find({
      where: type ? { type } : {},
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * Ad, tip ya da geometri değişir. Ad ve tip giriş kayıtlarına dokunmaz (kayıtlar alana
   * okunurken bağlanır). Geometri değişince, son konumu yeni şeklin dışında kalan scooter'ların
   * açık girişleri kapanır (AREA_CHANGED); içeride kalanların ziyareti bölünmez. Şekil
   * genişleyip içine aldığı scooter için giriş, o scooter'ın sonraki konumuyla açılır: giriş
   * zamanı hep konumdan gelir.
   */
  async update(id: string, dto: UpdateAreaDto): Promise<Area> {
    if (
      dto.name === undefined &&
      dto.type === undefined &&
      dto.geometry === undefined
    ) {
      throw new BadRequestException(
        'Değiştirilecek bir şey yok: name, type ya da geometry verin',
      );
    }
    if (dto.geometry) await this.assertValidPolygon(dto.geometry);
    const geometry = dto.geometry ? JSON.stringify(dto.geometry) : null;

    const closed = await this.areas.manager.transaction(async (manager) => {
      const [updated]: [unknown[], number] = await manager.query(
        `UPDATE areas
            SET name = coalesce($2, name),
                type = coalesce($3::area_type, type),
                geom = CASE WHEN $4::text IS NULL THEN geom
                            ELSE ST_SetSRID(ST_GeomFromGeoJSON($4), 4326) END
          WHERE id = $1 AND deleted_at IS NULL
         RETURNING id`,
        [id, dto.name ?? null, dto.type ?? null, geometry],
      );
      if (updated.length === 0) throw new NotFoundException('Alan bulunamadı');
      if (!geometry) return [];
      return this.closeVisits(
        manager,
        id,
        ExitReason.AREA_CHANGED,
        `AND NOT ST_Contains(
               (SELECT geom FROM areas WHERE id = $1),
               ST_SetSRID(ST_MakePoint(u.lng, u.lat), 4326))`,
      );
    });

    const area = await this.areas.findOneByOrFail({ id });
    void this.publisher.publishAreasChanged({ updated: this.ref(area) });
    void this.publisher.publishEvents(this.exitEvents(this.ref(area), closed));
    return area;
  }

  /**
   * Yumuşak silme: alan listede ve konum işlemede yok sayılır; giriş kayıtları kalır. İçinde
   * bulunulan girişler kapanır (AREA_REMOVED).
   */
  async remove(id: string): Promise<void> {
    const { area, closed } = await this.areas.manager.transaction(
      async (manager) => {
        const [rows]: [AreaRef[], number] = await manager.query(
          `UPDATE areas SET deleted_at = now()
            WHERE id = $1 AND deleted_at IS NULL
           RETURNING id, name, type`,
          [id],
        );
        if (rows.length === 0) throw new NotFoundException('Alan bulunamadı');
        return {
          area: rows[0],
          closed: await this.closeVisits(manager, id, ExitReason.AREA_REMOVED),
        };
      },
    );
    void this.publisher.publishAreasChanged({ deleted: { id } });
    void this.publisher.publishEvents(this.exitEvents(area, closed));
  }

  /**
   * Alanın açık girişlerini kapatır. Çıkış zamanı değişikliğin anıdır; cihaz saati sunucudan
   * biraz ileride olabildiği için girişten önceye düşmez.
   */
  private closeVisits(
    manager: EntityManager,
    areaId: string,
    reason: ExitReason,
    condition = '',
  ): Promise<ClosedVisit[]> {
    return manager
      .query(
        `UPDATE area_logs l
            SET exit_time = greatest(l.entry_time, now()), exit_reason = $2
           FROM user_last_location u
          WHERE l.area_id = $1 AND l.exit_time IS NULL AND u.user_id = l.user_id
                ${condition}
         RETURNING l.id, l.user_id, l.exit_time`,
        [areaId, reason],
      )
      .then(([rows]: [ClosedVisit[], number]) => rows);
  }

  private exitEvents(area: AreaRef, closed: ClosedVisit[]): AreaEvent[] {
    return closed.map((v) => ({
      logId: v.id,
      userId: v.user_id,
      eventType: AreaEventType.EXIT,
      area,
      occurredAt: v.exit_time.toISOString(),
    }));
  }

  private ref(area: Area): AreaRef {
    return { id: area.id, name: area.name, type: area.type };
  }

  /** Yapı DTO'da doğrulandı; kendini kesen poligon gibi geometrik hataları PostGIS söyler. */
  private async assertValidPolygon(geometry: Polygon): Promise<void> {
    const [check] = await this.areas.query(
      `SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason
         FROM (SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS g) s`,
      [JSON.stringify(geometry)],
    );
    if (!check.valid) {
      throw new BadRequestException(`Geçersiz poligon: ${check.reason}`);
    }
  }
}
