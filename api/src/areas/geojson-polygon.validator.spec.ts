import { polygonError } from './geojson-polygon.validator.js';

const square = [
  [29.02, 40.98],
  [29.03, 40.98],
  [29.03, 40.99],
  [29.02, 40.99],
  [29.02, 40.98],
];

describe('polygonError', () => {
  it('geçerli poligonu kabul eder', () => {
    expect(polygonError({ type: 'Polygon', coordinates: [square] })).toBeNull();
  });

  it('delikli poligonu kabul eder', () => {
    const hole = [
      [29.024, 40.984],
      [29.026, 40.984],
      [29.026, 40.986],
      [29.024, 40.984],
    ];
    expect(
      polygonError({ type: 'Polygon', coordinates: [square, hole] }),
    ).toBeNull();
  });

  it.each([
    ['nesne değil', 'abc', /GeoJSON nesnesi/],
    ['yanlış tip', { type: 'Point', coordinates: [1, 2] }, /Polygon/],
    ['halka yok', { type: 'Polygon', coordinates: [] }, /en az bir halka/],
    [
      'az nokta',
      { type: 'Polygon', coordinates: [square.slice(0, 3)] },
      /en az 4 nokta/,
    ],
    [
      'kapalı değil',
      { type: 'Polygon', coordinates: [[...square.slice(0, 4), [29.0, 40.0]]] },
      /kapalı değil/,
    ],
    [
      'enlem sınır dışı',
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 95],
            [1, 0],
            [0, 0],
          ],
        ],
      },
      /geçersiz koordinat/,
    ],
    [
      'sayı olmayan koordinat',
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            ['1', 1],
            [1, 0],
            [0, 0],
          ],
        ],
      },
      /geçersiz koordinat/,
    ],
  ])('%s → hata', (_label, value, message) => {
    expect(polygonError(value)).toMatch(message);
  });
});
