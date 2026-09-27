import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { LocationLanes } from '../queue/location-lanes.js';
import { DependencyStatus, HealthStatus } from './health-status.enum.js';
import { Public } from '../security/public.decorator.js';

/** Redis düşükken BullMQ komutları yeniden bağlanmayı bekler; health asılı kalmasın. */
const withTimeout = <T>(promise: Promise<T>, ms = 2000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);

const JOB_STATES = [
  'waiting',
  'active',
  'delayed',
  'failed',
  'completed',
] as const;

@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lanes: LocationLanes,
  ) {}

  @Get()
  @ApiOperation({ summary: 'DB, Redis ve kuyruk durumu' })
  async health(@Res({ passthrough: true }) res: Response) {
    const [database, queue] = await Promise.all([
      withTimeout(this.dataSource.query('SELECT 1')).then(
        () => DependencyStatus.UP,
        () => DependencyStatus.DOWN,
      ),
      // Sayımlar Redis'ten okunur (tüm şeritlerin toplamı); başarısızsa Redis erişilemez demektir.
      withTimeout(this.lanes.counts(...JOB_STATES)).catch(() => null),
    ]);
    const redis = queue ? DependencyStatus.UP : DependencyStatus.DOWN;

    const ok =
      database === DependencyStatus.UP && redis === DependencyStatus.UP;
    res.status(ok ? 200 : 503);
    return {
      status: ok ? HealthStatus.OK : HealthStatus.ERROR,
      database,
      redis,
      queue,
    };
  }
}
