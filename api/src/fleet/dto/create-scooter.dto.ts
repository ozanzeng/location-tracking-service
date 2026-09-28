import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  SCOOTER_NAME_MAX_LENGTH,
  USER_ID_MAX_LENGTH,
  USER_ID_PATTERN,
} from '../../config/limits.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateScooterDto {
  @ApiProperty({
    example: 'scooter-06',
    description: 'Konumlarda userId olarak gönderilen kimlik',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_ID_MAX_LENGTH)
  @Matches(USER_ID_PATTERN, {
    message: 'id sadece harf, rakam ve _ . : - içerebilir',
  })
  id: string;

  @ApiPropertyOptional({
    example: 'Scooter 06',
    description: 'Verilmezse kimlik kullanılır',
  })
  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(SCOOTER_NAME_MAX_LENGTH)
  name?: string;
}
