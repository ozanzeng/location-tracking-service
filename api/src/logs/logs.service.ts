import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { AreaType } from '../areas/area-type.enum.js';
import { decodeCursor, encodeCursor } from './cursor.js';
import type { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import type { LogPageDto } from './dto/log-response.dto.js';
import type { ExitReason } from '../geofence/exit-reason.enum.js';

interface LogRow {
  id: string;
  user_id: string;
  area_id: string;
  area_name: string;
  area_type: AreaType;
  entry_time: Date;
  exit_time: Date | null;
  exit_reason: ExitReason | null;
}

@Injectable()
export class LogsService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Keyset (cursor) sayfalama: OFFSET'in aksine sayfa derinleştikçe yavaşlamaz ve
   * (entry_time DESC, id DESC) index'lerini doğrudan kullanır.
   */
  async list(query: ListLogsQueryDto): Promise<LogPageDto> {
    const where: string[] = [];
    const params: unknown[] = [];
    const param = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };

    if (query.userId) where.push(`l.user_id = ${param(query.userId)}`);
    if (query.areaId) where.push(`l.area_id = ${param(query.areaId)}`);
    if (query.active !== undefined) {
      where.push(
        query.active ? 'l.exit_time IS NULL' : 'l.exit_time IS NOT NULL',
      );
    }
    if (query.from) where.push(`l.entry_time >= ${param(query.from)}`);
    if (query.to) where.push(`l.entry_time < ${param(query.to)}`);
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      if (!cursor) throw new BadRequestException('Geçersiz cursor');
      where.push(
        `(l.entry_time, l.id) < (${param(cursor.entryTime)}::timestamptz, ${param(cursor.id)}::bigint)`,
      );
    }

    const limit = query.limit;
    const rows: LogRow[] = await this.dataSource.query(
      `SELECT l.id, l.user_id, l.area_id, a.name AS area_name, a.type AS area_type,
              l.entry_time, l.exit_time, l.exit_reason
         FROM area_logs l
         JOIN areas a ON a.id = l.area_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY l.entry_time DESC, l.id DESC
        LIMIT ${param(limit + 1)}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page.at(-1);

    return {
      data: page.map((r) => ({
        id: r.id,
        userId: r.user_id,
        areaId: r.area_id,
        areaName: r.area_name,
        areaType: r.area_type,
        entryTime: r.entry_time.toISOString(),
        exitTime: r.exit_time?.toISOString() ?? null,
        exitReason: r.exit_reason,
      })),
      nextCursor:
        hasMore && last
          ? encodeCursor({
              entryTime: last.entry_time.toISOString(),
              id: last.id,
            })
          : null,
    };
  }
}
