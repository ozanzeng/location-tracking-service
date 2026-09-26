import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateLocationDto } from './dto/create-location.dto.js';
import { LatestLocationsQueryDto } from './dto/latest-query.dto.js';
import { LocationsService } from './locations.service.js';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Post()
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
  create(@Body() dto: CreateLocationDto) {
    return this.locationsService.enqueue(dto);
  }

  @Get('latest')
  @ApiOperation({ summary: 'Kullanıcıların son bilinen konumları' })
  @ApiOkResponse()
  latest(@Query() query: LatestLocationsQueryDto) {
    return this.locationsService.latest(query.sinceMinutes, query.limit);
  }
}
