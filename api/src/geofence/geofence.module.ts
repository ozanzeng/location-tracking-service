import { Module } from '@nestjs/common';
import { GeofenceService } from './geofence.service.js';

@Module({
  providers: [GeofenceService],
  exports: [GeofenceService],
})
export class GeofenceModule {}
