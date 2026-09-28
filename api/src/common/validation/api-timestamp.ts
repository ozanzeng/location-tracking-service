import { applyDecorators } from '@nestjs/common';
import { isISO8601, IsISO8601, Matches } from 'class-validator';
import { TIMESTAMP_EXAMPLE, TIMESTAMP_PATTERN } from '../../config/limits.js';

const message = `$property ISO 8601 biçiminde ve saat dilimli olmalı (ör. ${TIMESTAMP_EXAMPLE})`;

/** API'nin kabul ettiği zaman damgası mı (bkz. TIMESTAMP_PATTERN)? */
export const isApiTimestamp = (value: string): boolean =>
  TIMESTAMP_PATTERN.test(value) && isISO8601(value, { strict: true });

/**
 * DTO alanı için: biçim ve saat dilimi zorunlu, var olmayan gün reddedilir. Böylece
 * doğrulamadan geçen her değer JS Date ve Postgres timestamptz tarafından aynı anlamda çözülür.
 */
export const IsApiTimestamp = () =>
  applyDecorators(
    IsISO8601({ strict: true }, { message }),
    Matches(TIMESTAMP_PATTERN, { message }),
  );
