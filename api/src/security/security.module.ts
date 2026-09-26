import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './api-key.guard.js';
import { UserRateLimiter } from './user-rate-limiter.js';

@Module({
  providers: [{ provide: APP_GUARD, useClass: ApiKeyGuard }, UserRateLimiter],
  exports: [UserRateLimiter],
})
export class SecurityModule {}
