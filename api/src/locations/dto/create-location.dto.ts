import { ApiProperty } from '@nestjs/swagger';
import {
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { USER_ID_MAX_LENGTH, USER_ID_PATTERN } from '../../config/limits.js';

export class CreateLocationDto {
  @ApiProperty({ example: 'scooter-42' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_ID_MAX_LENGTH)
  @Matches(USER_ID_PATTERN, {
    message: 'userId sadece harf, rakam ve _ . : - içerebilir',
  })
  userId: string;

  @ApiProperty({ example: 40.9905, minimum: -90, maximum: 90 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 29.0235, minimum: -180, maximum: 180 })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiProperty({
    description:
      'Konumun cihazda ölçüldüğü an (ISO 8601). Giriş zamanı olarak bu değer kaydedilir.',
    example: '2026-09-25T10:00:00.000Z',
  })
  @IsISO8601({ strict: true })
  timestamp: string;
}
