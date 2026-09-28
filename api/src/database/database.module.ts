import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmOptions } from './typeorm-options.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => typeOrmOptions(config),
    }),
  ],
})
export class DatabaseModule {}
