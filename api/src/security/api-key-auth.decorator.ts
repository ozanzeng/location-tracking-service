import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiSecurity,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

/**
 * Swagger: uç nokta x-api-key ister (sürücülere açık olanlarda @AllowRiders sürücü oturumunu
 * da ekler); kimlik eksik ya da geçersizse 401, sürücü oturumu bu uç noktaya yetkili değilse 403.
 */
export const ApiKeyAuth = () =>
  applyDecorators(
    ApiSecurity('api-key'),
    ApiUnauthorizedResponse({
      description: 'x-api-key ya da sürücü oturumu eksik veya geçersiz',
    }),
    ApiForbiddenResponse({
      description: 'Sürücü oturumu bu uç noktaya yetkili değil',
    }),
  );
