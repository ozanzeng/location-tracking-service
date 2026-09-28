import { ApiProperty } from '@nestjs/swagger';
import { AreaType } from '../../areas/area-type.enum.js';
import { ExitReason } from '../exit-reason.enum.js';

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

  @ApiProperty({
    enum: ExitReason,
    enumName: 'ExitReason',
    nullable: true,
    description:
      'Çıkışın sebebi: LEFT alandan çıktı; SIGNAL_LOST konumu SIGNAL_LOSS_TIMEOUT_MS (30 sn) boyunca gelmedi, exitTime girişin kapatıldığı an; AREA_CHANGED alanın şekli değişti ve son konum yeni şeklin dışında kaldı; AREA_REMOVED alan silindi. Açık girişte null',
  })
  exitReason: ExitReason | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'Açık girişte: servisin kullanıcıdan son konumu aldığı an. Eskiyse kullanıcı konum göndermiyor (sinyal yok); "içeride" son bilinen durumdur. Kapanmış girişte null',
  })
  lastSeenAt: string | null;
}

export class LogPageDto {
  @ApiProperty({ type: [LogResponseDto] })
  data: LogResponseDto[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor: string | null;
}
