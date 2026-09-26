import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { LocationJobData } from '../queue/location-job.js';
import { AreaEventType } from './area-event-type.enum.js';
import { diffPresence } from './presence-diff.js';
import type { AreaEvent, AreaRef, ProcessResult } from './geofence.types.js';

interface StateRow {
  last_recorded_at: Date | null;
  inside: AreaRef[];
  present: AreaRef[];
}

interface LogRow {
  id: string;
  area_id: string;
  event_type: AreaEventType;
}

@Injectable()
export class GeofenceService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Bir konumu işler: içinde bulunduğu alanları bulur, önceki durumla karşılaştırır,
   * giriş/çıkışları loglar. Aynı kullanıcının konumları farklı worker'larda eşzamanlı
   * işlenebildiği için tüm adımlar kullanıcıya özel advisory lock altında tek transaction'dır.
   */
  async process(job: LocationJobData): Promise<ProcessResult> {
    const recordedAt = new Date(job.recordedAt);

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [job.userId],
      );

      // Son konum zamanı, noktayı içeren alanlar (GiST index) ve mevcut durum tek sorguda.
      const [state]: StateRow[] = await manager.query(
        `SELECT
           (SELECT recorded_at FROM user_last_location WHERE user_id = $1) AS last_recorded_at,
           COALESCE((
             SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type))
               FROM areas a
              WHERE ST_Contains(a.geom, ST_SetSRID(ST_MakePoint($2, $3), 4326))
           ), '[]'::json) AS inside,
           COALESCE((
             SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type))
               FROM area_logs l
               JOIN areas a ON a.id = l.area_id
              WHERE l.user_id = $1 AND l.exit_time IS NULL
           ), '[]'::json) AS present`,
        [job.userId, job.lng, job.lat],
      );

      // Sırası karışık gelen (daha eski) konum, güncel durumu geriye götürmesin.
      if (state.last_recorded_at && state.last_recorded_at >= recordedAt) {
        return { status: 'stale' } as const;
      }

      const { entered, exited } = diffPresence(
        state.present.map((a) => a.id),
        state.inside.map((a) => a.id),
      );

      // Girilen alanlar için ziyaret açılır, çıkılanların ziyareti kapatılır.
      // Açık ziyaret için unique index olduğundan kilit dışında da mükerrer giriş oluşamaz.
      const logs: LogRow[] = await manager.query(
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
        [job.userId, job.lat, job.lng, recordedAt, entered, exited],
      );

      const events = this.toEvents(job, logs, [
        ...state.present,
        ...state.inside,
      ]);
      return {
        status: 'processed',
        events,
        position: {
          userId: job.userId,
          lat: job.lat,
          lng: job.lng,
          recordedAt: job.recordedAt,
          areas: state.inside,
        },
      } as const;
    });
  }

  private toEvents(
    job: LocationJobData,
    logs: LogRow[],
    areas: AreaRef[],
  ): AreaEvent[] {
    const byId = new Map(areas.map((a) => [a.id, a]));
    return logs.map((log) => ({
      logId: log.id,
      userId: job.userId,
      eventType: log.event_type,
      area: byId.get(log.area_id)!,
      occurredAt: job.recordedAt,
    }));
  }
}
