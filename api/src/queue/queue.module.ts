import { Module } from '@nestjs/common';
import { LocationLanes } from './location-lanes.js';

@Module({
  providers: [LocationLanes],
  exports: [LocationLanes],
})
export class QueueModule {}
