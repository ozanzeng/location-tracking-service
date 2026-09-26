import type { PositionUpdate } from '../geofence/geofence.types.js';
import { PositionBuffer } from './position-buffer.js';

const position = (userId: string, lat: number): PositionUpdate => ({
  userId,
  lat,
  lng: 29,
  recordedAt: '2026-01-01T00:00:00Z',
  areas: [],
});

describe('PositionBuffer', () => {
  it('kullanıcı başına sadece son konumu tutar', () => {
    const buffer = new PositionBuffer();
    buffer.add(position('a', 1));
    buffer.add(position('b', 2));
    buffer.add(position('a', 3));
    expect(buffer.drain().map((p) => [p.userId, p.lat])).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
  });

  it('boşaltınca tampon sıfırlanır', () => {
    const buffer = new PositionBuffer();
    buffer.add(position('a', 1));
    buffer.drain();
    expect(buffer.drain()).toEqual([]);
  });
});
