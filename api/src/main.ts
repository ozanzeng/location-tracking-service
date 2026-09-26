import './config/env.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfigOrExit } from './config/configuration.js';
import { createLogger } from './config/logger.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  // Ayarlar geçersizse Nest ayağa kalkmadan, sorunları listeleyerek çık.
  const config = loadConfigOrExit(process.env, { apiServer: true });
  const app = await NestFactory.create(AppModule, { logger: createLogger() });
  setupApp(app);
  if (config.security.apiKeys.length === 0) {
    new Logger('Security').warn(
      'API_KEYS tanımlı değil: kimlik doğrulama kapalı (sadece yerel geliştirme için)',
    );
  }
  await app.listen(config.port);
}
await bootstrap();
