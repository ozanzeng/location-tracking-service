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
      // Önce en yeni `limit` kullanıcı seçilir, alanlar sadece onlar için okunur. Eskiden
      // penceredeki tüm kullanıcılar birleştirilip gruplanıyor, sonra kesiliyordu: 50 bin
      // kullanıcıda (30 dk, limit 1000) 40 ms → 9 ms. user_id: aynı saniyedekiler arasında
      // sıra belirli olsun (limit sınırında hangi kullanıcının kalacağı değişmesin).
      `SELECT l.user_id, l.lat, l.lng, l.recorded_at,
              COALESCE(z.areas, '[]'::json) AS areas
         FROM (SELECT user_id, lat, lng, recorded_at
                 FROM user_last_location
                WHERE recorded_at > now() - make_interval(mins => $1)
                ORDER BY recorded_at DESC, user_id
                LIMIT $2) l
         LEFT JOIN LATERAL (
               SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type)) AS areas
                 FROM area_logs v
                 JOIN areas a ON a.id = v.area_id
                WHERE v.user_id = l.user_id AND v.exit_time IS NULL
              ) z ON true
        ORDER BY l.recorded_at DESC, l.user_id`,
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
