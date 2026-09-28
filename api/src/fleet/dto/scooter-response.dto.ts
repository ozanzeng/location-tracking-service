import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ScooterStatus } from '../scooter-status.enum.js';

export class ScooterRiderDto {
  @ApiProperty()
  username: string;

  @ApiProperty({ description: 'Kiralamanın başladığı an' })
  since: string;
}

export class ScooterResponseDto {
  @ApiProperty({ example: 'scooter-01' })
  id: string;

  @ApiProperty({ example: 'Scooter 01' })
  name: string;

  @ApiProperty({ enum: ScooterStatus })
  status: ScooterStatus;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Son konumun zamanı; hiç konum göndermediyse null',
  })
  lastSeenAt: string | null;

  @ApiPropertyOptional({
    type: ScooterRiderDto,
    nullable: true,
    description: 'Kimde olduğu; sadece API anahtarıyla (operasyon) görünür',
  })
  rider?: ScooterRiderDto | null;

  @ApiPropertyOptional({
    description:
      'Sürücünün kendi kiraladığı scooter mı; sadece sürücü oturumunda',
  })
  mine?: boolean;
}
