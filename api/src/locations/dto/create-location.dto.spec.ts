import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateLocationDto } from './create-location.dto.js';

const errorsFor = (body: object) =>
  validateSync(plainToInstance(CreateLocationDto, body)).map((e) => e.property);

describe('CreateLocationDto', () => {
  it('geçerli konumu kabul eder', () => {
    expect(
      errorsFor({
        userId: 'scooter-1',
        lat: 40.99,
        lng: 29.02,
        timestamp: '2026-09-25T10:00:00.000Z',
      }),
    ).toEqual([]);
  });

  const ts = '2026-09-25T10:00:00.000Z';

  it.each([
    [{ userId: 'u', lat: 91, lng: 0, timestamp: ts }, 'lat'],
    [{ userId: 'u', lat: 0, lng: -181, timestamp: ts }, 'lng'],
    [{ userId: 'u', lat: '40.9', lng: 0, timestamp: ts }, 'lat'],
    [{ userId: '', lat: 0, lng: 0, timestamp: ts }, 'userId'],
    [{ userId: 'boşluk var', lat: 0, lng: 0, timestamp: ts }, 'userId'],
    [{ userId: 'u', lat: 0, lng: 0, timestamp: 'dün' }, 'timestamp'],
    [{ userId: 'u', lat: 0, lng: 0 }, 'timestamp'],
  ])('%o → %s hatası', (body, property) => {
    expect(errorsFor(body)).toContain(property);
  });

  // Doğrulamadan geçip JS Date ya da Postgres tarafından çözülemeyen biçimler 500 veriyordu.
  it.each([
    ['sıkışık biçim', '20260928T100000Z'],
    ['hafta biçimi', '2026-W39-1'],
    ['yalnızca yıl', '2026'],
    ['saat dilimsiz (sunucu saatine göre yorumlanırdı)', '2026-09-28T10:00:00'],
    ['var olmayan gün', '2026-02-30T10:00:00Z'],
  ])('timestamp: %s → hata', (_label, timestamp) => {
    expect(errorsFor({ userId: 'u', lat: 0, lng: 0, timestamp })).toContain(
      'timestamp',
    );
  });

  it.each([
    '2026-09-28T10:00:00Z',
    '2026-09-28T10:00:00.123Z',
    '2026-09-28T13:00:00+03:00',
    '2024-02-29T10:00Z',
  ])('timestamp %s kabul edilir', (timestamp) => {
    expect(errorsFor({ userId: 'u', lat: 0, lng: 0, timestamp })).toEqual([]);
  });
});
