import { Module } from '@nestjs/common';
import { FleetInfraModule } from './fleet-infra.module.js';
import { RentalsController } from './rentals.controller.js';
import { RentalsService } from './rentals.service.js';
import { ScooterRegistry } from './scooter-registry.js';
import { ScootersController } from './scooters.controller.js';
import { ScootersService } from './scooters.service.js';

/** Filo ve kiralama (API süreci). */
@Module({
  imports: [FleetInfraModule],
  controllers: [ScootersController, RentalsController],
  providers: [ScootersService, RentalsService, ScooterRegistry],
  exports: [RentalsService, ScooterRegistry],
})
export class FleetModule {}
