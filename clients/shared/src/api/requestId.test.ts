import { describe, expect, test } from 'vitest';
import { newRequestId } from './requestId';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('newRequestId', () => {
  test('güvenli bağlamda crypto.randomUUID kullanır', () => {
    expect(newRequestId({ randomUUID: () => 'uuid', getRandomValues: crypto.getRandomValues.bind(crypto) })).toBe(
      'uuid',
    );
  });

  test('randomUUID yoksa (HTTP üzerinden LAN IP) geçerli bir UUID v4 üretir', () => {
    const insecure = { getRandomValues: crypto.getRandomValues.bind(crypto) };
    const ids = Array.from({ length: 50 }, () => newRequestId(insecure));
    for (const id of ids) expect(id).toMatch(UUID_V4);
    expect(new Set(ids).size).toBe(50);
  });
});
