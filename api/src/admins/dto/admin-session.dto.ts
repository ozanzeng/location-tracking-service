import { ApiProperty } from '@nestjs/swagger';

export class AdminDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'admin' })
  username: string;
}

export class AdminSessionDto {
  @ApiProperty({
    description:
      'Yönetici oturumu; istekte Authorization: Bearer <token> olarak gönderilir',
  })
  token: string;

  @ApiProperty({ description: 'Oturumun kaç saniye sonra düşeceği' })
  expiresIn: number;

  @ApiProperty({ type: AdminDto })
  admin: AdminDto;
}
