import { ConsoleLogger, type LogLevel } from '@nestjs/common';
import { isProduction, LOG_LEVELS, LogFormat } from './runtime.enum.js';

/**
 * Production'da log toplayıcıların ayrıştırabilmesi için tek satır JSON; yerelde okunur format.
 * LOG_FORMAT=json|pretty, LOG_LEVEL=log (bu seviye ve üstü) ile değiştirilebilir.
 */
export function createLogger(
  env: NodeJS.ProcessEnv = process.env,
): ConsoleLogger {
  const format =
    env.LOG_FORMAT ?? (isProduction(env) ? LogFormat.JSON : LogFormat.PRETTY);
  const json = format === LogFormat.JSON;
  const level = (env.LOG_LEVEL ?? 'log') as LogLevel;
  const index = LOG_LEVELS.indexOf(level);
  return new ConsoleLogger({
    json,
    colors: !json,
    logLevels: LOG_LEVELS.slice(0, index === -1 ? 4 : index + 1),
  });
}
