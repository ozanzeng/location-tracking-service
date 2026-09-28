import { decodeCursor, encodeCursor } from './cursor.js';

describe('log cursor', () => {
  it('encode/decode birbirinin tersidir', () => {
    const cursor = { entryTime: '2026-09-25T10:00:00.000Z', id: '42' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    '',
    'abc',
    Buffer.from('tarih-degil|1').toString('base64url'),
    Buffer.from('2026-09-25T10:00:00Z|x').toString('base64url'),
  ])('geçersiz cursor %s → null', (raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });

  // Postgres'e gitseler timestamptz/bigint dönüşümü 500 verirdi.
  it.each([
    ['var olmayan gün', '2026-02-30T10:00:00Z|1'],
    ['saat dilimsiz', '2026-09-25T10:00:00|1'],
    ['yalnızca yıl', '2024|1'],
    ['bigint sınırını aşan kimlik', '2026-09-25T10:00:00Z|9223372036854775808'],
    ['çok uzun kimlik', `2026-09-25T10:00:00Z|${'9'.repeat(30)}`],
  ])('%s → null', (_label, text) => {
    expect(decodeCursor(Buffer.from(text).toString('base64url'))).toBeNull();
  });

  it('bigint sınırındaki kimliği kabul eder', () => {
    const cursor = {
      entryTime: '2026-09-25T10:00:00.000Z',
      id: '9223372036854775807',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });
});
