import { HttpStatus, type ArgumentsHost } from '@nestjs/common';
import {
  RetryableHttpException,
  RetryAfterFilter,
} from './retryable.exception.js';

describe('RetryAfterFilter', () => {
  it('durum kodunu, Retry-After başlığını ve gövdeyi yazar', () => {
    const res = { status: vi.fn(), setHeader: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    res.setHeader.mockReturnValue(res);
    const host = {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost;

    new RetryAfterFilter().catch(
      new RetryableHttpException(HttpStatus.TOO_MANY_REQUESTS, 'yavaş', 42),
      host,
    );

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
    expect(res.json).toHaveBeenCalledWith({
      statusCode: 429,
      message: 'yavaş',
      retryAfter: 42,
    });
  });
});
