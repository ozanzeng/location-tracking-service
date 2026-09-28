import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecurityModule } from '../security/security.module.js';
import { AuthController } from './auth.controller.js';
import { LoginThrottle } from './login-throttle.js';
import { Rider } from './rider.entity.js';
import { RidersService } from './riders.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Rider]), SecurityModule],
  controllers: [AuthController],
  providers: [RidersService, LoginThrottle],
  exports: [LoginThrottle],
})
export class RidersModule {}
