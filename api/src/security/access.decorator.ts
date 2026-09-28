import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Access } from './access.enum.js';

export const ACCESS = 'access';

/**
 * API anahtarı ya da sürücü oturumu. Swagger'da sürücü oturumu (Bearer) sadece bu uç noktalarda
 * görünür; işaretsiz uç noktalar yalnızca API anahtarı ister.
 */
export const AllowRiders = () =>
  applyDecorators(
    SetMetadata(ACCESS, Access.RIDER_OR_SERVICE),
    ApiBearerAuth('rider'),
  );

/** Sadece giriş yapmış sürücü. */
export const RidersOnly = () =>
  applyDecorators(SetMetadata(ACCESS, Access.RIDER), ApiBearerAuth('rider'));
