import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isRider, type Principal, type RiderPrincipal } from './principal.js';

/** İsteği yapan sürücü; @RidersOnly uç noktalarda AuthGuard bunu garanti eder. */
export const CurrentRider = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RiderPrincipal => {
    const principal = ctx.switchToHttp().getRequest<Request>().principal;
    if (!isRider(principal)) {
      throw new UnauthorizedException('Sürücü girişi gerekli');
    }
    return principal;
  },
);

/** İsteği yapan (servis ya da sürücü). */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined =>
    ctx.switchToHttp().getRequest<Request>().principal,
);
