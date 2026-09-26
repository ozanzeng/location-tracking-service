import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  LOCATION_JOB,
  LOCATION_QUEUE,
  type LocationJobData,
} from '../queue/location-job.js';
import type { AreaRef } from '../geofence/geofence.types.js';
import type { CreateLocationDto } from './dto/create-location.dto.js';

/** Cihaz saatinin sunucudan ileride olmasına izin verilen pay. */
const MAX_CLOCK_SKEW_MS = 60_000;

export interface LatestPosition {
  userId: string;
  lat: number;
  lng: number;
  recordedAt: string;
  /** Kullanıcının şu an içinde bulunduğu alanlar (açık girişler). */
  areas: AreaRef[];
}

@Injectable()
export class LocationsService {
  constructor(
    @InjectQueue(LOCATION_QUEUE)
    private readonly queue: Queue<LocationJobData>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async enqueue(
    dto: CreateLocationDto,
    now = new Date(),
  ): Promise<{ jobId: string; recordedAt: string }> {
    const recordedAt = new Date(dto.timestamp);
    if (recordedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
      // İleri tarihli bir konum, sonraki gerçek konumların "eski" sayılıp atlanmasına yol açar.
      throw new BadRequestException('timestamp gelecekte olamaz');
    }

    const job = await this.queue.add(LOCATION_JOB, {
      userId: dto.userId,
      lat: dto.lat,
      lng: dto.lng,
      recordedAt: recordedAt.toISOString(),
    });
    return { jobId: job.id!, recordedAt: recordedAt.toISOString() };
  }

  /** Canlı izleme ekranının ilk yüklemesi için son bilinen konumlar. */
  async latest(sinceMinutes: number, limit: number): Promise<LatestPosition[]> {
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
