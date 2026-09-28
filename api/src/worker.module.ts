import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { FleetInfraModule } from './fleet/fleet-infra.module.js';
import { IdleRentalSweeper } from './fleet/idle-rental.sweeper.js';
import { GeofenceModule } from './geofence/geofence.module.js';
import { LaneWorkers } from './geofence/lane-workers.js';
import { LocationProcessor } from './geofence/location.processor.js';
import { SignalLossSweeper } from './geofence/signal-loss.sweeper.js';
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
    FleetInfraModule,
  ],
  providers: [
    LocationProcessor,
    LaneWorkers,
    SignalLossSweeper,
    IdleRentalSweeper,
  ],
})
export class WorkerModule {}
