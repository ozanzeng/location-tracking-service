import type { NextFunction, Request, Response } from 'express';
import { RequestContextMiddleware } from './request-context.middleware.js';

function run(incoming?: string) {
  const headers: Record<string, string> = {};
  const req = {
    header: () => incoming,
    method: 'GET',
    originalUrl: '/x',
  } as unknown as Request;
  const res = {
    setHeader: (k: string, v: string) => (headers[k] = v),
    on: vi.fn(),
    statusCode: 200,
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  new RequestContextMiddleware().use(req, res, next);
  return { req, headers, next };
}

describe('RequestContextMiddleware', () => {
  it('geçerli gelen x-request-id korunur ve yanıta yazılır', () => {
    const { req, headers, next } = run('mobil-abc_1.2');
    expect(req.id).toBe('mobil-abc_1.2');
    expect(headers['x-request-id']).toBe('mobil-abc_1.2');
    expect(next).toHaveBeenCalled();
  });

  it.each([undefined, '', 'boşluk var', 'x'.repeat(129), '<script>'])(
    'geçersiz kimlik (%j) yerine yenisi üretilir',
    (incoming) => {
      const { req } = run(incoming);
      expect(req.id).toMatch(/^[0-9a-f-]{36}$/);
    },
  );
});
