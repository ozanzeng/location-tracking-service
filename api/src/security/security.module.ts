import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { RiderSessions } from './rider-sessions.js';
import { UserRateLimiter } from './user-rate-limiter.js';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    RiderSessions,
    UserRateLimiter,
  ],
  exports: [RiderSessions, UserRateLimiter],
})
export class SecurityModule {}
