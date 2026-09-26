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
});
