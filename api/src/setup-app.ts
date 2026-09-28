import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppExceptionFilter } from './common/http/app-exception.filter.js';
import { corsOrigin } from './config/cors.js';
import { CorsIoAdapter } from './realtime/cors-io.adapter.js';
import { JSON_BODY_LIMIT } from './config/limits.js';
import { collectProcessMetrics } from './metrics/metrics.js';
import { API_KEY_HEADER } from './security/security.constants.js';
import type { AppConfig } from './config/configuration.types.js';
import { APP_CONFIG } from './config/config.constants.js';

/** main.ts ve e2e testleri aynı ayarları kullansın diye ortak kurulum. */
export function setupApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);

  collectProcessMetrics();
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  // Varsayılan JSON ayrıştırıcıdan önce kaydedilir; Nest varsayılanı eklemez.
  (app as NestExpressApplication).useBodyParser('json', {
    limit: JSON_BODY_LIMIT,
  });
  const origin = corsOrigin(config.security.corsOrigins);
  app.enableCors({ origin });
  app.useWebSocketAdapter(
    new CorsIoAdapter(app, origin, {
      pingInterval: config.realtime.pingIntervalMs,
      pingTimeout: config.realtime.pingTimeoutMs,
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AppExceptionFilter(app.getHttpAdapter()));
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Location Tracking Service')
      .setDescription(
        'Kullanıcı konumlarını alır, tanımlı polygon alanlara girişleri kaydeder.',
      )
      .setVersion('1.0')
      .addApiKey(
        { type: 'apiKey', in: 'header', name: API_KEY_HEADER },
        'api-key',
      )
      // Sürücü oturumu: POST /auth/login'in döndürdüğü token.
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'rider')
      // Yönetici oturumu: POST /auth/admin/login'in döndürdüğü token (operasyon paneli).
      .addBearerAuth({ type: 'http', scheme: 'bearer' }, 'admin')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
