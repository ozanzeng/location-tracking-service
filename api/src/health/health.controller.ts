import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { LocationLanes } from '../queue/location-lanes.js';
import { Public } from '../security/public.decorator.js';
import { allUp, checkDependencies, withTimeout } from './dependency-check.js';
import { HealthStatus } from './health-status.enum.js';
import { JOB_STATES } from './health.constants.js';

/**
 * Üç kontrol, üç ayrı soru:
 * - /health/live (liveness): süreç cevap veriyor mu? Bağımlılıklara bakmaz: veritabanı kısa
 *   süre düştüğünde orkestratör bütün API'leri yeniden başlatıp sorunu büyütmesin.
 * - /health/ready (readiness): trafik alabilir mi? Veritabanı ve Redis'e ulaşılamıyorsa ya da
 *   kapanış başladıysa 503; load balancer bu instance'a istek göndermez.
 * - /health: operasyon ekranı için ayrıntılı durum (kuyruk sayıları dahil).
 */
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly lanes: LocationLanes,
  ) {}

  @Get()
  @ApiOperation({ summary: 'DB, Redis ve kuyruk durumu (operasyon ekranı)' })
  async health(@Res({ passthrough: true }) res: Response) {
    const [deps, queue] = await Promise.all([
      checkDependencies(this.dataSource, this.lanes),
      // Sayımlar Redis'ten okunur (tüm şeritlerin toplamı).
      withTimeout(this.lanes.counts(...JOB_STATES)).catch(() => null),
    ]);
    const ok = allUp(deps);
    res.status(ok ? 200 : 503);
    return {
      status: ok ? HealthStatus.OK : HealthStatus.ERROR,
      ...deps,
      queue,
    };
  }

  @Get('live')
  @ApiOperation({
    summary: 'Liveness: süreç cevap veriyor (bağımlılıklara bakmaz)',
  })
  live() {
    return { status: HealthStatus.OK };
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Readiness: veritabanı ve Redis erişilebilir, trafik alınabilir',
  })
  async ready(@Res({ passthrough: true }) res: Response) {
    const deps = await checkDependencies(this.dataSource, this.lanes);
    const ok = allUp(deps);
    res.status(ok ? 200 : 503);
    return { status: ok ? HealthStatus.OK : HealthStatus.ERROR, ...deps };
  }
}
