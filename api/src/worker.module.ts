import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { GeofenceModule } from './geofence/geofence.module.js';
import { LocationProcessor } from './geofence/location.processor.js';
import { QueueModule } from './queue/queue.module.js';
import { RealtimePublisherModule } from './realtime/realtime-publisher.module.js';

/** Kuyruktaki konumları işleyen süreç; HTTP sunucusu yok, yatayda çoğaltılır. */
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    QueueModule,
    GeofenceModule,
    RealtimePublisherModule,
  ],
  providers: [LocationProcessor],
})
export class WorkerModule {}
