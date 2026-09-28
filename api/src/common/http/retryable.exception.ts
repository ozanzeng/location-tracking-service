import { HttpException, type HttpStatus } from '@nestjs/common';

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
