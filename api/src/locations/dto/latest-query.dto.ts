import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import {
  LATEST_LIMIT_DEFAULT,
  LATEST_LIMIT_MAX,
  LATEST_SINCE_MINUTES_DEFAULT,
  LATEST_SINCE_MINUTES_MAX,
} from '../../config/limits.js';

export class LatestLocationsQueryDto {
  @ApiPropertyOptional({
    default: LATEST_SINCE_MINUTES_DEFAULT,
    maximum: LATEST_SINCE_MINUTES_MAX,
    description: 'Son kaç dakikadaki konumlar',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LATEST_SINCE_MINUTES_MAX)
  // Tip açıkça yazılmalı: sabitten gelen değerde Swagger'a tip Object olarak gider.
  sinceMinutes: number = LATEST_SINCE_MINUTES_DEFAULT;

  @ApiPropertyOptional({
    default: LATEST_LIMIT_DEFAULT,
    maximum: LATEST_LIMIT_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LATEST_LIMIT_MAX)
  limit: number = LATEST_LIMIT_DEFAULT;
}
