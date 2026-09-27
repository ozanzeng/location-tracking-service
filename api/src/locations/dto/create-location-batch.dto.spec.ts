import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { MAX_BATCH_SIZE } from '../../config/limits.js';
import { CreateLocationBatchDto } from './create-location-batch.dto.js';

const location = {
  userId: 'u',
  lat: 1,
  lng: 2,
  timestamp: '2026-09-25T10:00:00.000Z',
};
const errorsFor = (body: object) =>
  validateSync(plainToInstance(CreateLocationBatchDto, body));

describe('CreateLocationBatchDto', () => {
  it('geçerli toplu isteği kabul eder', () => {
    expect(errorsFor({ locations: [location, location] })).toEqual([]);
  });

  it.each([
    ['boş liste', { locations: [] }],
    [
      'sınırı aşan liste',
      { locations: Array(MAX_BATCH_SIZE + 1).fill(location) },
    ],
    ['iç öğe geçersiz', { locations: [{ ...location, lat: 200 }] }],
    ['dizi değil', { locations: location }],
  ])('%s → hata', (_label, body) => {
    expect(errorsFor(body).length).toBeGreaterThan(0);
  });
});
