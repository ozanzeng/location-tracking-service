import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { MAX_BATCH_SIZE } from '../../config/limits.js';
import { CreateLocationDto } from './create-location.dto.js';

export class CreateLocationBatchDto {
  @ApiProperty({
    type: [CreateLocationDto],
    description: `En fazla ${MAX_BATCH_SIZE} konum. Bağlantı koptuğunda biriken konumlar tek istekte gönderilebilir.`,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => CreateLocationDto)
  locations: CreateLocationDto[];
}
