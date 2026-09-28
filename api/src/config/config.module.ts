import { Global, Module } from '@nestjs/common';
import { loadConfig } from './configuration.js';
import { APP_CONFIG } from './config.constants.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
