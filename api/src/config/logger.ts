import { ConsoleLogger, type LogLevel } from '@nestjs/common';

const LEVELS: LogLevel[] = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
];

/**
 * Production'da log toplayıcıların ayrıştırabilmesi için tek satır JSON; yerelde okunur format.
 * LOG_FORMAT=json|pretty, LOG_LEVEL=log (bu seviye ve üstü) ile değiştirilebilir.
 */
export function createLogger(
  env: NodeJS.ProcessEnv = process.env,
): ConsoleLogger {
  const json =
    (env.LOG_FORMAT ?? (env.NODE_ENV === 'production' ? 'json' : 'pretty')) ===
    'json';
  const level = (env.LOG_LEVEL ?? 'log') as LogLevel;
  const index = LEVELS.indexOf(level);
  return new ConsoleLogger({
    json,
    colors: !json,
    logLevels: LEVELS.slice(0, index === -1 ? 4 : index + 1),
  });
}
