import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  type HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

/** İstemcinin ne kadar sonra tekrar denemesi gerektiğini de bildiren hata (429, 503). */
export class RetryableHttpException extends HttpException {
  constructor(
    status: HttpStatus,
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(
      { statusCode: status, message, retryAfter: retryAfterSeconds },
      status,
    );
  }
}

@Catch(RetryableHttpException)
export class RetryAfterFilter implements ExceptionFilter {
  catch(exception: RetryableHttpException, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    res
      .status(exception.getStatus())
      .setHeader('Retry-After', String(exception.retryAfterSeconds))
      .json(exception.getResponse());
  }
}
