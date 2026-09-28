import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { isAdmin, isRider } from './principal.js';
import type {
  AdminPrincipal,
  Principal,
  RiderPrincipal,
} from './security.types.js';

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

/** İsteği yapan yönetici; @AdminsOnly uç noktalarda AuthGuard bunu garanti eder. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal => {
    const principal = ctx.switchToHttp().getRequest<Request>().principal;
    if (!isAdmin(principal)) {
      throw new UnauthorizedException('Yönetici girişi gerekli');
    }
    return principal;
  },
);

/** İsteği yapan (servis, yönetici ya da sürücü). */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined =>
    ctx.switchToHttp().getRequest<Request>().principal,
);
