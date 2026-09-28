import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { USER_ID_MAX_LENGTH, USER_ID_PATTERN } from '../../config/limits.js';

export class RentScooterDto {
  @ApiProperty({ example: 'scooter-01' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_ID_MAX_LENGTH)
  @Matches(USER_ID_PATTERN)
  scooterId: string;
}
