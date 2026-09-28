import { isApiTimestamp } from '../common/validation/api-timestamp.js';
import { MAX_LOG_ID } from '../config/limits.js';

export interface LogCursor {
  entryTime: string;
  id: string;
}

/** (entry_time, id) çiftini opak bir sayfalama imlecine çevirir. */
export function encodeCursor(cursor: LogCursor): string {
  return Buffer.from(`${cursor.entryTime}|${cursor.id}`).toString('base64url');
}

/**
 * İmleç istemciden geri gelir, değiştirilmiş olabilir: zaman ve kimlik Postgres'e gitmeden
 * doğrulanır (timestamptz ve bigint dönüşümü 500 yerine geçersiz imleç olarak 400 versin).
 */
export function decodeCursor(raw: string): LogCursor | null {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const [entryTime, id, ...rest] = decoded.split('|');
  if (
    rest.length > 0 ||
    !entryTime ||
    !id ||
    !/^\d{1,19}$/.test(id) ||
    BigInt(id) > MAX_LOG_ID ||
    !isApiTimestamp(entryTime)
  ) {
    return null;
  }
  return { entryTime, id };
}
