import './config/env.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadConfigOrExit } from './config/configuration.js';
import { createLogger } from './config/logger.js';
import { securityWarnings } from './security/startup-warnings.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  // Ayarlar geçersizse Nest ayağa kalkmadan, sorunları listeleyerek çık.
  const config = loadConfigOrExit(process.env, { apiServer: true });
  const app = await NestFactory.create(AppModule, {
    logger: createLogger(),
    // Kapanış başlayınca yeni isteklere 503: istemci (ve load balancer) tekrar dener.
    return503OnClosing: true,
  });
  setupApp(app);
  for (const warning of securityWarnings(config.security, process.env)) {
    new Logger('Security').warn(warning);
  }
  await app.listen(config.port);
}
await bootstrap();
