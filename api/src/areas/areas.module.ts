import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Area } from './area.entity.js';
import { AreasController } from './areas.controller.js';
import { AreasService } from './areas.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Area])],
  controllers: [AreasController],
  providers: [AreasService],
})
export class AreasModule {}
