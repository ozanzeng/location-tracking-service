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
});
