import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { SecurityModule } from '../security/security.module.js';
import { QueueBackpressure } from './queue-backpressure.js';
import { LocationsController } from './locations.controller.js';
import { LatestLocationsService } from './latest-locations.service.js';
import { LocationsService } from './locations.service.js';

@Module({
  imports: [QueueModule, SecurityModule, FleetModule],
  controllers: [LocationsController],
  providers: [LocationsService, LatestLocationsService, QueueBackpressure],
})
export class LocationsModule {}
