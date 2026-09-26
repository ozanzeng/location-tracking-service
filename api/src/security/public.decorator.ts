import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** API anahtarı istemeyen uç noktalar (health, metrics). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
