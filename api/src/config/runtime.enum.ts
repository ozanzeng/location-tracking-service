import type { LogLevel } from '@nestjs/common';

export enum NodeEnv {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test',
}

/** LOG_FORMAT: production'da log toplayıcılar için tek satır JSON, yerelde okunur biçim. */
export enum LogFormat {
  JSON = 'json',
  PRETTY = 'pretty',
}

/** LOG_LEVEL değerleri, en önemliden en ayrıntılıya. */
export const LOG_LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

export const isProduction = (env: NodeJS.ProcessEnv) =>
  env.NODE_ENV === NodeEnv.PRODUCTION;
