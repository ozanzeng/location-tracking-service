import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** main.ts ve e2e testleri aynı ayarları kullansın diye ortak kurulum. */
export function setupApp(app: INestApplication): void {
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Konum Loglama API')
      .setDescription(
        'Kullanıcı konumlarını alır, tanımlı alanlara giriş/çıkışları loglar.',
      )
      .setVersion('1.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
