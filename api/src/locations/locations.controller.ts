import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ApiKeyAuth } from '../security/api-key-auth.decorator.js';
import { RequestId } from '../common/http/request-id.decorator.js';
import { AllowRiders } from '../security/access.decorator.js';
import { CurrentPrincipal } from '../security/current-rider.decorator.js';
import type { Principal } from '../security/principal.js';
import { CreateLocationBatchDto } from './dto/create-location-batch.dto.js';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { LatestLocationsQueryDto } from './dto/latest-query.dto.js';
import { LatestLocationsService } from './latest-locations.service.js';
import { LocationsService } from './locations.service.js';

@ApiTags('locations')
@ApiKeyAuth()
@ApiTooManyRequestsResponse({
  description:
    'Kullanıcı başına dakikalık sınır aşıldı; Retry-After kadar bekleyin',
})
@ApiServiceUnavailableResponse({
  description: 'Kuyruk dolu; Retry-After kadar bekleyip tekrar gönderin',
})
@ApiBadRequestResponse({
  description: 'Doğrulama hatası ya da kayıtlı olmayan scooter',
})
@ApiForbiddenResponse({
  description: 'Sürücü oturumu: scooter bu sürücüye kiralı değil',
})
@ApiConflictResponse({
  description: 'Sürücü oturumu: aktif kiralama yok (önce scooter seçilmeli)',
})
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly latestLocations: LatestLocationsService,
  ) {}

  @Post()
  @AllowRiders()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Konum bildir',
    description:
      'Konum kuyruğa alınır ve worker tarafından asenkron işlenir. Alan girişleri GET /logs üzerinden görülür. ' +
      'userId kayıtlı bir scooter olmalı. Sürücü oturumuyla sadece kiralanan scooter için gönderilir; API anahtarıyla kayıtlı her scooter için (park halindeyken de).',
  })
  @ApiAcceptedResponse({
    schema: {
      example: { jobId: '17:123', recordedAt: '2026-09-25T10:00:00.000Z' },
    },
  })
  create(
    @Body() dto: CreateLocationDto,
    @CurrentPrincipal() sender?: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.locationsService.enqueue(dto, sender, requestId);
  }

  @Post('batch')
  @AllowRiders()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Toplu konum bildir',
    description:
      'Cihazın biriktirdiği konumları tek istekte gönderir. Doğrulama hepsi-ya-hiçbiri: bir konum geçersizse hiçbiri kuyruğa alınmaz.',
  })
  @ApiAcceptedResponse({
    schema: { example: { accepted: 2, jobIds: ['17:124', '3:125'] } },
  })
  createBatch(
    @Body() dto: CreateLocationBatchDto,
    @CurrentPrincipal() sender?: Principal,
    @RequestId() requestId?: string,
  ) {
    return this.locationsService.enqueueBatch(dto.locations, sender, requestId);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Kullanıcıların son bilinen konumları' })
  @ApiOkResponse()
  latest(@Query() query: LatestLocationsQueryDto) {
    return this.latestLocations.find(query.sinceMinutes, query.limit);
  }
}
