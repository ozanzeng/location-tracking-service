import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class LatestLocationsQueryDto {
  @ApiPropertyOptional({ default: 30, description: 'Son kaç dakikadaki konumlar' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  sinceMinutes = 30;

  @ApiPropertyOptional({ default: 1000, maximum: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limit = 1000;
}
