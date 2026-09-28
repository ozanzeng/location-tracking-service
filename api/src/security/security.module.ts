import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { Sessions } from './sessions.js';
import { UserRateLimiter } from './user-rate-limiter.js';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    Sessions,
    UserRateLimiter,
  ],
  exports: [Sessions, UserRateLimiter],
})
export class SecurityModule {}
