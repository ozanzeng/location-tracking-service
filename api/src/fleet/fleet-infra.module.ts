import { Module } from '@nestjs/common';
import { DeviceLog } from './device-log.js';
import { FleetEvents } from './fleet-events.js';
import { RentalCache } from './rental-cache.js';

/** API'nin ve worker'ın ortak kullandığı filo altyapısı (duyuru, kiralama önbelleği, cihaz günlüğü). */
@Module({
  providers: [FleetEvents, RentalCache, DeviceLog],
  exports: [FleetEvents, RentalCache, DeviceLog],
})
export class FleetInfraModule {}
