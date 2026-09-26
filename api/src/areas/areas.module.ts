import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimePublisherModule } from '../realtime/realtime-publisher.module.js';
import { Area } from './area.entity.js';
import { AreasController } from './areas.controller.js';
import { AreasService } from './areas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Area]), RealtimePublisherModule],
  controllers: [AreasController],
  providers: [AreasService],
})
export class AreasModule {}
