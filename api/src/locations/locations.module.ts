import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module.js';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';

@Module({
  imports: [QueueModule],
  controllers: [LocationsController],
  providers: [LocationsService],
})
export class LocationsModule {}
