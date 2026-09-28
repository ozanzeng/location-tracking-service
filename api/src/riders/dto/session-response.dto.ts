import { ApiProperty } from '@nestjs/swagger';

export class RiderDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'ali.yilmaz' })
  username: string;
}

export class SessionResponseDto {
  @ApiProperty({
    description:
      'Sürücü oturumu; istekte Authorization: Bearer <token> olarak gönderilir',
  })
  token: string;

  @ApiProperty({ description: 'Oturumun kaç saniye sonra düşeceği' })
  expiresIn: number;

  @ApiProperty({ type: RiderDto })
  rider: RiderDto;
}
