import { applyDecorators } from '@nestjs/common';
import { ApiSecurity, ApiUnauthorizedResponse } from '@nestjs/swagger';

/** Swagger: uç nokta x-api-key ister; anahtar eksik ya da yanlışsa 401. */
export const ApiKeyAuth = () =>
  applyDecorators(
    ApiSecurity('api-key'),
    ApiUnauthorizedResponse({
      description: 'x-api-key başlığı eksik veya geçersiz',
    }),
  );
