import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { LOCATION_QUEUE } from '../queue/location-job.js';
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
    @InjectQueue(LOCATION_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  @ApiOperation({ summary: 'DB, Redis ve kuyruk durumu' })
  async health(@Res({ passthrough: true }) res: Response) {
    const [database, queue] = await Promise.all([
      withTimeout(this.dataSource.query('SELECT 1')).then(
        () => 'up' as const,
        () => 'down' as const,
      ),
      // Sayımlar Redis'ten okunur; başarısızsa Redis erişilemez demektir.
      withTimeout(this.queue.getJobCounts(...JOB_STATES)).catch(() => null),
    ]);
    const redis = queue ? 'up' : 'down';

    const ok = database === 'up' && redis === 'up';
    res.status(ok ? 200 : 503);
    return { status: ok ? 'ok' : 'error', database, redis, queue };
  }
}
