import { ApiProperty } from '@nestjs/swagger';
import { RentalEndReason } from '../rental-end-reason.enum.js';

export class RentalResponseDto {
  @ApiProperty({ example: 'scooter-01' })
  scooterId: string;

  @ApiProperty()
  startedAt: string;

  @ApiProperty({ type: String, nullable: true })
  endedAt: string | null;

  @ApiProperty({ enum: RentalEndReason, nullable: true })
  endReason: RentalEndReason | null;
}

export class CurrentRentalResponseDto {
  @ApiProperty({
    type: RentalResponseDto,
    nullable: true,
    description: 'Aktif kiralama; yoksa null',
  })
  rental: RentalResponseDto | null;
}
