import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { UserLocation } from '../queue/location-job.js';
import type { AreaEventType } from './area-event-type.enum.js';
import type { AreaRef } from './geofence.types.js';

/** İşlemeye başlamadan önceki durum. */
export interface GeofenceState {
  /** Kullanıcının en son işlenen konumunun zamanı. */
  lastRecordedAt: Date | null;
  /** Yeni konumu içeren alanlar. */
  inside: AreaRef[];
  /** Açık girişi olan (şu an içinde bulunulan) alanlar. */
  present: AreaRef[];
}

export interface Transition {
  logId: string;
  areaId: string;
  eventType: AreaEventType;
}

/**
 * Konum işlemenin SQL tarafı. Metodlar çağıranın transaction'ı içinde çalışır
 * (EntityManager parametre olarak gelir); transaction ve akış GeofenceService'tedir.
 */
@Injectable()
export class GeofenceRepository {
  /** Aynı kullanıcının konumlarını transaction sonuna kadar sırayla işlemek için kilit. */
  async lockUser(manager: EntityManager, userId: string): Promise<void> {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [userId],
    );
  }

  /**
   * Bu transaction'ın commit'ini diske yazılmasını beklemeden onayla. Sadece giriş/çıkış
   * olmayan konumlarda kullanılır: çökmede kaybolabilecek tek şey son konumdur ve bir
   * sonraki konumla (5 sn) zaten yenilenir. Giriş kayıtları her zaman dayanıklı yazılır.
   */
  async relaxCommitDurability(manager: EntityManager): Promise<void> {
    await manager.query(`SET LOCAL synchronous_commit = off`);
  }

  /** Son konum zamanı, noktayı içeren alanlar (GiST index) ve açık girişler tek sorguda. */
  async readState(
    manager: EntityManager,
    location: UserLocation,
  ): Promise<GeofenceState> {
    const [row]: Array<{
      last_recorded_at: Date | null;
      inside: AreaRef[];
      present: AreaRef[];
    }> = await manager.query(
      `SELECT
           (SELECT recorded_at FROM user_last_location WHERE user_id = $1) AS last_recorded_at,
           COALESCE((
             SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type))
               FROM areas a
              WHERE ST_Contains(a.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326))
                AND a.deleted_at IS NULL
           ), '[]'::json) AS inside,
           COALESCE((
             SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type))
               FROM area_logs l
               JOIN areas a ON a.id = l.area_id
              WHERE l.user_id = $1 AND l.exit_time IS NULL
           ), '[]'::json) AS present`,
      [location.userId, location.lng, location.lat],
    );
    return {
      lastRecordedAt: row.last_recorded_at,
      inside: row.inside,
      present: row.present,
    };
  }

  /**
   * Tek sorguda: son konumu günceller, girilen alanlar için giriş kaydı açar, çıkılanların
   * kaydını kapatır. Açık giriş için unique index olduğundan kilit dışında da mükerrer
   * giriş oluşamaz.
   */
  async applyTransitions(
    manager: EntityManager,
    location: UserLocation,
    entered: string[],
    exited: string[],
  ): Promise<Transition[]> {
    const rows: Array<{
      id: string;
      area_id: string;
      event_type: AreaEventType;
    }> = await manager.query(
      `WITH
         upsert_location AS (
           INSERT INTO user_last_location (user_id, lat, lng, recorded_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id) DO UPDATE
             SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, recorded_at = EXCLUDED.recorded_at
         ),
         closed AS (
           UPDATE area_logs SET exit_time = $4
            WHERE user_id = $1 AND exit_time IS NULL AND area_id = ANY($6::uuid[])
           RETURNING id, area_id, 'EXIT' AS event_type
         ),
         opened AS (
           INSERT INTO area_logs (user_id, area_id, entry_time)
           SELECT $1, unnest($5::uuid[]), $4
           ON CONFLICT (user_id, area_id) WHERE exit_time IS NULL DO NOTHING
           RETURNING id, area_id, 'ENTER' AS event_type
         )
       SELECT * FROM opened
       UNION ALL
       SELECT * FROM closed`,
      [
        location.userId,
        location.lat,
        location.lng,
        new Date(location.recordedAt),
        entered,
        exited,
      ],
    );
    return rows.map((r) => ({
      logId: r.id,
      areaId: r.area_id,
      eventType: r.event_type,
    }));
  }
}
