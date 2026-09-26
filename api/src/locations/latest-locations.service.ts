import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AreaRef } from '../geofence/geofence.types.js';

export interface LatestPosition {
  userId: string;
  lat: number;
  lng: number;
  recordedAt: string;
  /** Kullanıcının şu an içinde bulunduğu alanlar (açık girişler). */
  areas: AreaRef[];
}

/** Okuma tarafı: canlı izleme ekranının ilk yüklemesi için son bilinen konumlar. */
@Injectable()
export class LatestLocationsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async find(sinceMinutes: number, limit: number): Promise<LatestPosition[]> {
    const rows: Array<{
      user_id: string;
      lat: number;
      lng: number;
      recorded_at: Date;
      areas: AreaRef[];
    }> = await this.dataSource.query(
      `SELECT l.user_id, l.lat, l.lng, l.recorded_at,
                COALESCE(
                  json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type))
                    FILTER (WHERE a.id IS NOT NULL),
                  '[]'::json
                ) AS areas
           FROM user_last_location l
           LEFT JOIN area_logs v ON v.user_id = l.user_id AND v.exit_time IS NULL
           LEFT JOIN areas a ON a.id = v.area_id
          WHERE l.recorded_at > now() - make_interval(mins => $1)
          GROUP BY l.user_id
          ORDER BY l.recorded_at DESC
          LIMIT $2`,
      [sinceMinutes, limit],
    );
    return rows.map((r) => ({
      userId: r.user_id,
      lat: r.lat,
      lng: r.lng,
      recordedAt: r.recorded_at.toISOString(),
      areas: r.areas,
    }));
  }
}
