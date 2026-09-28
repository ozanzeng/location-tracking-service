import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, Max, Min, ValidateIf } from 'class-validator';

/**
 * Sürüşün bittiği konum. Sürücü uygulaması son konumu kuyruğa bıraktıktan hemen sonra bitirir;
 * kuyruk yükteyse sunucudaki son konum birkaç saniye geride kalabilir, bu yüzden cihaz o anki
 * konumunu da gönderir. Verilmezse scooter'ın sunucuda işlenmiş son konumu kullanılır.
 */
export class EndRentalDto {
  @ApiPropertyOptional({ example: 40.9905, minimum: -90, maximum: 90 })
  @ValidateIf((o: EndRentalDto) => o.lat !== undefined || o.lng !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 29.0235, minimum: -180, maximum: 180 })
  @ValidateIf((o: EndRentalDto) => o.lat !== undefined || o.lng !== undefined)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  lng?: number;
}
