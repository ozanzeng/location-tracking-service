import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { RetryAfterFilter } from './common/http/retryable.exception.js';
import { corsOrigin } from './config/cors.js';
import { CorsIoAdapter } from './realtime/cors-io.adapter.js';
import { APP_CONFIG, type AppConfig } from './config/configuration.js';
import { collectProcessMetrics } from './metrics/metrics.js';
import { API_KEY_HEADER } from './security/api-key.guard.js';

/** main.ts ve e2e testleri aynı ayarları kullansın diye ortak kurulum. */
export function setupApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);

  collectProcessMetrics();
  app.getHttpAdapter().getInstance().disable('x-powered-by');
  const origin = corsOrigin(config.security.corsOrigins);
  app.enableCors({ origin });
  app.useWebSocketAdapter(new CorsIoAdapter(app, origin));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new RetryAfterFilter());
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
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
