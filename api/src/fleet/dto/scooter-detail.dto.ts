import { ApiProperty } from '@nestjs/swagger';
import { AreaType } from '../../areas/area-type.enum.js';
import { AreaEventType } from '../../geofence/area-event-type.enum.js';
import { DeviceLogResult } from '../device-log-result.enum.js';
import { RentalEndReason } from '../rental-end-reason.enum.js';
import { ScooterStatus } from '../scooter-status.enum.js';
import { ScooterRiderDto } from './scooter-response.dto.js';

class LastLocationDto {
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
  @ApiProperty({ description: 'Konumun cihazda ölçüldüğü an' })
  recordedAt: string;
}

class CurrentAreaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: AreaType }) type: AreaType;
  @ApiProperty({ description: 'Alana giriş anı' }) since: string;
}

class RentalHistoryDto {
  @ApiProperty() username: string;
  @ApiProperty() startedAt: string;
  @ApiProperty({ type: String, nullable: true }) endedAt: string | null;
  @ApiProperty({ enum: RentalEndReason, nullable: true })
  endReason: RentalEndReason | null;
}

class DeviceLogEventDto {
  @ApiProperty({ enum: AreaEventType }) type: AreaEventType;
  @ApiProperty() area: { id: string; name: string; type: AreaType };
}

class DeviceLogEntryDto {
  @ApiProperty({ description: "API'nin konumu kabul ettiği an" })
  receivedAt: string;
  @ApiProperty({ description: "Worker'ın işlediği an" }) processedAt: string;
  @ApiProperty({ description: 'Cihazda ölçüldüğü an' }) recordedAt: string;
  @ApiProperty() lat: number;
  @ApiProperty() lng: number;
  @ApiProperty({ enum: DeviceLogResult }) result: DeviceLogResult;
  @ApiProperty({ type: [DeviceLogEventDto] }) events: DeviceLogEventDto[];
  @ApiProperty({ required: false }) requestId?: string;
}

/** Operasyonun scooter detayı: durum, konum, içinde bulunduğu alanlar, kiralamalar, cihaz günlüğü. */
export class ScooterDetailDto {
  @ApiProperty({ example: 'scooter-01' }) id: string;

  @ApiProperty({
    description: 'Filoda kayıtlı ve silinmemiş mi (değilse konum gönderemez)',
  })
  registered: boolean;

  @ApiProperty({ type: String, nullable: true }) name: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Filodan çıkarıldığı an',
  })
  removedAt: string | null;

  @ApiProperty({ enum: ScooterStatus, nullable: true })
  status: ScooterStatus | null;

  @ApiProperty({ type: ScooterRiderDto, nullable: true })
  rider: ScooterRiderDto | null;

  @ApiProperty({ type: LastLocationDto, nullable: true })
  lastLocation: LastLocationDto | null;

  @ApiProperty({ type: [CurrentAreaDto] }) currentAreas: CurrentAreaDto[];

  @ApiProperty({ type: [RentalHistoryDto], description: 'Son 10 kiralama' })
  rentals: RentalHistoryDto[];

  @ApiProperty({
    type: [DeviceLogEntryDto],
    description:
      'Sunucunun işlediği son konumlar, en yeni başta (DEVICE_LOG_SIZE, DEVICE_LOG_TTL_HOURS)',
  })
  deviceLog: DeviceLogEntryDto[];
}
