export interface LogCursor {
  entryTime: string;
  id: string;
}

/** (entry_time, id) çiftini opak bir sayfalama imlecine çevirir. */
export function encodeCursor(cursor: LogCursor): string {
  return Buffer.from(`${cursor.entryTime}|${cursor.id}`).toString('base64url');
}

export function decodeCursor(raw: string): LogCursor | null {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const [entryTime, id, ...rest] = decoded.split('|');
  if (
    rest.length > 0 ||
    !entryTime ||
    !id ||
    !/^\d+$/.test(id) ||
    Number.isNaN(Date.parse(entryTime))
  ) {
    return null;
  }
  return { entryTime, id };
}
