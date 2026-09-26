import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { SecurityModule } from '../security/security.module.js';
import { QueueBackpressure } from './queue-backpressure.js';
import { LocationsController } from './locations.controller.js';
import { LatestLocationsService } from './latest-locations.service.js';
import { LocationsService } from './locations.service.js';

@Module({
  imports: [QueueModule, SecurityModule],
  controllers: [LocationsController],
  providers: [LocationsService, LatestLocationsService, QueueBackpressure],
})
export class LocationsModule {}
