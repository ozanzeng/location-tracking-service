import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiKeyAuth } from '../security/api-key-auth.decorator.js';
import { IngestAllowed } from '../security/ingest-allowed.decorator.js';
import { AreasService } from './areas.service.js';
import { CreateAreaDto } from './dto/create-area.dto.js';
import { ListAreasQueryDto } from './dto/list-areas-query.dto.js';
import { AreaResponseDto } from './dto/area-response.dto.js';

@ApiTags('areas')
@ApiKeyAuth()
@Controller('areas')
export class AreasController {
  constructor(private readonly areasService: AreasService) {}

  @Post()
  @ApiCreatedResponse({ type: AreaResponseDto })
  async create(@Body() dto: CreateAreaDto): Promise<AreaResponseDto> {
    return AreaResponseDto.from(await this.areasService.create(dto));
  }

  @Get()
  @IngestAllowed()
  @ApiOkResponse({ type: [AreaResponseDto] })
  async findAll(@Query() query: ListAreasQueryDto): Promise<AreaResponseDto[]> {
    const areas = await this.areasService.findAll(query.type);
    return areas.map((area) => AreaResponseDto.from(area));
  }
}
