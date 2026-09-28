import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RidersModule } from '../riders/riders.module.js';
import { SecurityModule } from '../security/security.module.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { Admin } from './admin.entity.js';
import { AdminsService } from './admins.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Admin]), SecurityModule, RidersModule],
  controllers: [AdminAuthController],
  providers: [AdminsService],
})
export class AdminsModule {}
