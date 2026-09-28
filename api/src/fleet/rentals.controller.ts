import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RidersOnly } from '../security/access.decorator.js';
import { CurrentRider } from '../security/current-rider.decorator.js';
import { EndRentalDto } from './dto/end-rental.dto.js';
import { RentScooterDto } from './dto/rent-scooter.dto.js';
import {
  CurrentRentalResponseDto,
  RentalResponseDto,
} from './dto/rental-response.dto.js';
import { RentalsService } from './rentals.service.js';
import type { RiderPrincipal } from '../security/security.types.js';

/** Sürücünün scooter alıp bırakması; sadece sürücü oturumuyla. */
@ApiTags('rentals')
@ApiUnauthorizedResponse({ description: 'Sürücü girişi gerekli' })
@RidersOnly()
@Controller('rentals')
export class RentalsController {
  constructor(private readonly rentals: RentalsService) {}

  @Post()
  @ApiOperation({ summary: 'Scooter kirala' })
  @ApiCreatedResponse({ type: RentalResponseDto })
  @ApiNotFoundResponse({ description: 'Scooter bulunamadı' })
  @ApiConflictResponse({
    description: 'Scooter kullanımda ya da sürücü zaten bir scooter kullanıyor',
  })
  rent(
    @CurrentRider() rider: RiderPrincipal,
    @Body() dto: RentScooterDto,
  ): Promise<RentalResponseDto> {
    return this.rentals.rent(rider, dto.scooterId);
  }

  @Get('current')
  @ApiOperation({
    summary: 'Aktif kiralama (sayfa yenilenince sürüşe devam için)',
  })
  @ApiOkResponse({ type: CurrentRentalResponseDto })
  async current(
    @CurrentRider() rider: RiderPrincipal,
  ): Promise<CurrentRentalResponseDto> {
    return { rental: await this.rentals.current(rider.riderId) };
  }

  @Post('current/end')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sürüşü bitir, scooter boşa çıkar',
    description:
      'Sadece park alanında (park yasak bölge dışında) biter. Gövdede cihazın o anki konumu gönderilebilir; yoksa scooterın sunucudaki son konumu kullanılır.',
  })
  @ApiOkResponse({ type: RentalResponseDto })
  @ApiNotFoundResponse({ description: 'Aktif kiralama yok' })
  @ApiConflictResponse({
    description: 'Scooter park alanında değil ya da park yasak bölgede',
  })
  end(
    @CurrentRider() rider: RiderPrincipal,
    @Body() dto: EndRentalDto,
  ): Promise<RentalResponseDto> {
    return this.rentals.end(rider, dto);
  }
}
