import { describe, expect, test, vi } from 'vitest';
import { api, ApiError, setAuthToken, setUnauthorizedHandler } from './client';

const point = { userId: 'u1', lat: 41, lng: 29, timestamp: '2026-01-01T10:00:00Z' };

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  // Her çağrıda yeni yanıt: bir Response gövdesi yalnızca bir kez okunabilir.
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit & { headers: Record<string, string> }) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type Call = [string, { body: string; headers: Record<string, string> }];
/** Sahte fetch'e yapılan çağrılar (url, istek). */
const calls = (fetchMock: ReturnType<typeof mockFetch>) => fetchMock.mock.calls as unknown as Call[];

describe('api istemcisi', () => {
  test('tek konum POST /locations, birden fazlası POST /locations/batch', async () => {
    const fetchMock = mockFetch(202, { jobId: '1' }, { 'x-request-id': 'r1' });
    await api.sendLocations([point]);
    expect(calls(fetchMock)[0][0]).toBe('/api/locations');
    expect(JSON.parse(calls(fetchMock)[0][1].body)).toEqual(point);

    await api.sendLocations([point, point]);
    expect(calls(fetchMock)[1][0]).toBe('/api/locations/batch');
    expect(JSON.parse(calls(fetchMock)[1][1].body)).toEqual({ locations: [point, point] });
  });

  test('her istek bir x-request-id taşır; sunucunun döndürdüğü kimlik verilir', async () => {
    const fetchMock = mockFetch(202, { jobId: '1' }, { 'x-request-id': 'sunucu-kimligi' });
    const { requestId } = await api.sendLocations([point]);
    expect(calls(fetchMock)[0][1].headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId).toBe('sunucu-kimligi');
  });

  test('429: durum, Retry-After ve mesaj ApiError ile gelir', async () => {
    mockFetch(429, { message: 'Kullanıcı başına sınır' }, { 'retry-after': '17', 'x-request-id': 'r2' });
    const err = await api.sendLocations([point]).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 429,
      retryAfterSeconds: 17,
      requestId: 'r2',
      message: 'Kullanıcı başına sınır',
    });
  });

  test('doğrulama hataları birleştirilir', async () => {
    mockFetch(400, { message: ['lat hatalı', 'lng hatalı'] });
    await expect(api.sendLocations([point])).rejects.toMatchObject({ status: 400, message: 'lat hatalı, lng hatalı' });
  });

  test('ağ hatası durum 0 olarak gelir', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.sendLocations([point])).rejects.toMatchObject({ status: 0, message: 'Sunucuya ulaşılamadı' });
  });

  test('log sorgusu boş filtreleri göndermez', async () => {
    const fetchMock = mockFetch(200, { data: [], nextCursor: null });
    await api.logs({ userId: 'u1', areaId: undefined, active: false, limit: 50 });
    expect(calls(fetchMock)[0][0]).toBe('/api/logs?userId=u1&active=false&limit=50');
  });

  test('oturumla atılan istek 401 alınca oturum düştü bildirilir; giriş denemesi ve oturumsuz istek bildirmez', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    try {
      mockFetch(401, { message: 'Oturum geçersiz' });
      await api.logs().catch(() => undefined);
      expect(onUnauthorized).not.toHaveBeenCalled();

      setAuthToken('oturum-token-1234567890');
      await api.adminLogin('ayse', 'yanlis').catch(() => undefined);
      expect(onUnauthorized).not.toHaveBeenCalled();
      const fetchMock = mockFetch(401, { message: 'Oturum geçersiz' });
      await api.logs().catch(() => undefined);
      expect(onUnauthorized).toHaveBeenCalledTimes(1);
      expect(calls(fetchMock)[0][1].headers.authorization).toBe('Bearer oturum-token-1234567890');
    } finally {
      setAuthToken(null);
      setUnauthorizedHandler(null);
    }
  });
});
