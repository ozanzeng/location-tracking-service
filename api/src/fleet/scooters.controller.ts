import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AllowRiders } from '../security/access.decorator.js';
import { ApiKeyAuth } from '../security/api-key-auth.decorator.js';
import { CurrentPrincipal } from '../security/current-rider.decorator.js';
import type { Principal } from '../security/principal.js';
import { CreateScooterDto } from './dto/create-scooter.dto.js';
import { ScooterDetailDto } from './dto/scooter-detail.dto.js';
import { ScooterResponseDto } from './dto/scooter-response.dto.js';
import { ScootersService } from './scooters.service.js';

/** Filo: listeleme sürücüye de açık; ekleme ve silme operasyonun (API anahtarı). */
@ApiTags('scooters')
@ApiKeyAuth()
@Controller('scooters')
export class ScootersController {
  constructor(private readonly scooters: ScootersService) {}

  @Get()
  @AllowRiders()
  @ApiOperation({
    summary: 'Scooterlar ve durumları',
    description:
      'Durum aktif kiralamadan hesaplanır. Sürücü kimin kullandığını görmez; operasyon görür.',
  })
  @ApiOkResponse({ type: [ScooterResponseDto] })
  list(@CurrentPrincipal() viewer?: Principal): Promise<ScooterResponseDto[]> {
    return this.scooters.list(viewer);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Scooter detayı (operasyon)',
    description:
      'Durum, kimde, son konum, içinde bulunduğu alanlar, son kiralamalar ve sunucunun işlediği son konumlar (cihaz günlüğü). Filodan çıkarılmış kimlikler için de konumu varsa döner.',
  })
  @ApiOkResponse({ type: ScooterDetailDto })
  @ApiNotFoundResponse({ description: 'Scooter bulunamadı' })
  detail(@Param('id') id: string): Promise<ScooterDetailDto> {
    return this.scooters.detail(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Scooter ekle',
    description:
      'Aynı kimlikle silinmiş bir scooter varsa geri getirilir. Eklenen scooter hemen konum gönderebilir.',
  })
  @ApiCreatedResponse({ type: ScooterResponseDto })
  @ApiConflictResponse({ description: 'Bu kimlikle bir scooter zaten var' })
  create(@Body() dto: CreateScooterDto): Promise<ScooterResponseDto> {
    return this.scooters.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Scooter sil',
    description:
      'Silinen scooter konum gönderemez ve kiralanamaz; giriş kayıtları kalır.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Scooter bulunamadı' })
  @ApiConflictResponse({ description: 'Scooter kullanımda' })
  remove(@Param('id') id: string): Promise<void> {
    return this.scooters.remove(id);
  }
}
