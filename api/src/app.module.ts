import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { AreasModule } from './areas/areas.module.js';
import { RequestContextMiddleware } from './common/http/request-context.middleware.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FleetModule } from './fleet/fleet.module.js';
import { HealthModule } from './health/health.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { LogsModule } from './logs/logs.module.js';
import { MetricsModule } from './metrics/metrics.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { RidersModule } from './riders/riders.module.js';
import { SecurityModule } from './security/security.module.js';

/** HTTP + WebSocket süreci. Konum işleme ayrı süreçte (WorkerModule) çalışır. */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    SecurityModule,
    RidersModule,
    FleetModule,
    AreasModule,
    LocationsModule,
    LogsModule,
    HealthModule,
    MetricsModule,
    RealtimeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}
