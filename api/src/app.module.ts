import { Module } from '@nestjs/common';
import { AreasModule } from './areas/areas.module.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { LocationsModule } from './locations/locations.module.js';
import { LogsModule } from './logs/logs.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

/** HTTP + WebSocket süreci. Konum işleme ayrı süreçte (WorkerModule) çalışır. */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    AreasModule,
    LocationsModule,
    LogsModule,
    HealthModule,
    RealtimeModule,
  ],
})
export class AppModule {}
