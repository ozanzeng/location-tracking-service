import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { typeOrmOptions } from './typeorm-options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => typeOrmOptions(config),
    }),
  ],
})
export class DatabaseModule {}
