import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC } from './security.constants.js';

/** API anahtarı istemeyen uç noktalar (health, metrics). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
