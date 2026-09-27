import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LOGS_PAGE_DEFAULT,
  LOGS_PAGE_MAX,
  USER_ID_MAX_LENGTH,
} from '../../config/limits.js';

export class ListLogsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(USER_ID_MAX_LENGTH)
  userId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional({
    description:
      'true: sadece hâlâ alan içinde olunan girişler, false: sadece çıkılmış girişler',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Bu giriş zamanından itibaren (ISO 8601, dahil)',
  })
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional({
    description: 'Bu giriş zamanına kadar (ISO 8601, hariç)',
  })
  @IsOptional()
  @IsISO8601()
  to?: string;

  @ApiPropertyOptional({
    default: LOGS_PAGE_DEFAULT,
    minimum: 1,
    maximum: LOGS_PAGE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LOGS_PAGE_MAX)
  // Tip açıkça yazılmalı: sabitten gelen değerde Swagger'a tip Object olarak gider.
  limit: number = LOGS_PAGE_DEFAULT;

  @ApiPropertyOptional({ description: 'Önceki yanıttaki nextCursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}
