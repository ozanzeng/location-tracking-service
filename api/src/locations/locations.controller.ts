import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ApiKeyAuth } from '../security/api-key-auth.decorator.js';
import { RequestId } from '../common/http/request-id.decorator.js';
import { IngestAllowed } from '../security/ingest-allowed.decorator.js';
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
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly locationsService: LocationsService,
    private readonly latestLocations: LatestLocationsService,
  ) {}

  @Post()
  @IngestAllowed()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Konum bildir',
    description:
      'Konum kuyruğa alınır ve worker tarafından asenkron işlenir. Alan girişleri GET /logs üzerinden görülür.',
  })
  @ApiAcceptedResponse({
    schema: {
      example: { jobId: '123', recordedAt: '2026-09-25T10:00:00.000Z' },
    },
  })
  create(@Body() dto: CreateLocationDto, @RequestId() requestId?: string) {
    return this.locationsService.enqueue(dto, requestId);
  }

  @Post('batch')
  @IngestAllowed()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Toplu konum bildir',
    description:
      'Cihazın biriktirdiği konumları tek istekte gönderir. Doğrulama hepsi-ya-hiçbiri: bir konum geçersizse hiçbiri kuyruğa alınmaz.',
  })
  @ApiAcceptedResponse({
    schema: { example: { accepted: 2, jobIds: ['124', '125'] } },
  })
  createBatch(
    @Body() dto: CreateLocationBatchDto,
    @RequestId() requestId?: string,
  ) {
    return this.locationsService.enqueueBatch(dto.locations, requestId);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Kullanıcıların son bilinen konumları' })
  @ApiOkResponse()
  latest(@Query() query: LatestLocationsQueryDto) {
    return this.latestLocations.find(query.sinceMinutes, query.limit);
  }
}
