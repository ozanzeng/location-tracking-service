import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AreaType } from '../area-type.enum.js';

export class ListAreasQueryDto {
  @ApiPropertyOptional({ enum: AreaType })
  @IsOptional()
  @IsEnum(AreaType)
  type?: AreaType;
}
