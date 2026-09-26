import { Module } from '@nestjs/common';
import { GeofenceRepository } from './geofence.repository.js';
import { GeofenceService } from './geofence.service.js';

@Module({
  providers: [GeofenceService, GeofenceRepository],
  exports: [GeofenceService],
})
export class GeofenceModule {}
