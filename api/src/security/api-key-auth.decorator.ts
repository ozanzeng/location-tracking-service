import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiSecurity,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

/**
 * Swagger: uç nokta x-api-key ister; anahtar eksik ya da yanlışsa 401, sürücü
 * (INGEST_API_KEYS) anahtarı bu uç noktaya yetkili değilse 403.
 */
export const ApiKeyAuth = () =>
  applyDecorators(
    ApiSecurity('api-key'),
    ApiUnauthorizedResponse({
      description: 'x-api-key başlığı eksik veya geçersiz',
    }),
    ApiForbiddenResponse({
      description:
        'Sürücü anahtarı sadece konum gönderip alan listesini okuyabilir',
    }),
  );
