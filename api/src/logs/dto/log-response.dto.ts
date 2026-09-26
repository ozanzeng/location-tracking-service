import { ApiProperty } from '@nestjs/swagger';
import { AreaType } from '../../areas/area-type.enum.js';

export class LogResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty({ format: 'uuid' })
  areaId: string;

  @ApiProperty()
  areaName: string;

  @ApiProperty({ enum: AreaType })
  areaType: AreaType;

  @ApiProperty({ description: 'Alana giriş anı (konumun ölçüldüğü zaman)' })
  entryTime: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Alandan çıkış anı; kullanıcı hâlâ içerideyse null',
  })
  exitTime: string | null;
}

export class LogPageDto {
  @ApiProperty({ type: [LogResponseDto] })
  data: LogResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
}
