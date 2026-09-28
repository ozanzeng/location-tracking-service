import {
  type ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { HttpServer } from '@nestjs/common';
import { AppExceptionFilter } from './app-exception.filter.js';
import { RetryableHttpException } from './retryable.exception.js';

const setup = () => {
  const res = {
    headersSent: false,
    status: vi.fn(),
    setHeader: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  const req = { id: 'istek-42', method: 'POST', path: '/locations' };
  const host = {
    getType: () => 'http',
    getArgByIndex: (i: number) => [req, res][i],
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
  // Nest'in standart yanıtı HTTP adaptörü üzerinden yazılır.
  const adapter = { reply: vi.fn(), isHeadersSent: () => false, end: vi.fn() };
  const filter = new AppExceptionFilter(adapter as unknown as HttpServer);
  return { res, host, adapter, filter };
};

describe('AppExceptionFilter', () => {
  afterEach(() => vi.restoreAllMocks());

  it('429/503: Retry-After başlığını ve gövdeyi yazar', () => {
    const { res, host, adapter, filter } = setup();
    filter.catch(
      new RetryableHttpException(HttpStatus.TOO_MANY_REQUESTS, 'yavaş', 42),
      host,
    );
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
    expect(adapter.reply).toHaveBeenCalledWith(
      res,
      { statusCode: 429, message: 'yavaş', retryAfter: 42 },
      429,
    );
  });

  it("diğer HTTP hatalarını Nest'in standart biçimiyle döndürür, loglamaz", () => {
    const { res, host, adapter, filter } = setup();
    const error = vi.spyOn(Logger.prototype, 'error');
    filter.catch(new NotFoundException('yok'), host);
    expect(res.setHeader).not.toHaveBeenCalled();
    expect(adapter.reply).toHaveBeenCalledWith(
      res,
      expect.objectContaining({ statusCode: 404, message: 'yok' }),
      404,
    );
    expect(error).not.toHaveBeenCalled();
  });

  it("Express'in kendi hatalarını (bozuk JSON gibi) kendi koduyla döndürür", () => {
    const { res, host, filter } = setup();
    const error = vi.spyOn(Logger.prototype, 'error');
    // body-parser'ın fırlattığı http-errors biçimi.
    const invalidJson = Object.assign(new Error('Unexpected token'), {
      expose: true,
      status: 400,
      statusCode: 400,
    });
    filter.catch(invalidJson, host);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'Unexpected token',
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('beklenmeyen hatayı istek kimliğiyle bir kez loglar ve 500 döner', () => {
    const { res, host, filter } = setup();
    const error = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    filter.catch(new Error('Connection is closed.'), host);
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toMatchObject({
      requestId: 'istek-42',
      method: 'POST',
      path: '/locations',
      error: 'Connection is closed.',
    });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'Internal server error',
      requestId: 'istek-42',
    });
  });
});
