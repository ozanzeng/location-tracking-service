import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiKeyAuth } from '../security/api-key-auth.decorator.js';
import { AllowRiders } from '../security/access.decorator.js';
import { AreasService } from './areas.service.js';
import { CreateAreaDto } from './dto/create-area.dto.js';
import { ListAreasQueryDto } from './dto/list-areas-query.dto.js';
import { AreaResponseDto } from './dto/area-response.dto.js';
import { UpdateAreaDto } from './dto/update-area.dto.js';

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
  @AllowRiders()
  @ApiOkResponse({ type: [AreaResponseDto] })
  async findAll(@Query() query: ListAreasQueryDto): Promise<AreaResponseDto[]> {
    const areas = await this.areasService.findAll(query.type);
    return areas.map((area) => AreaResponseDto.from(area));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Alanı düzenle (ad, tip, geometri)',
    description:
      'Geometri değişirse son konumu yeni şeklin dışında kalan scooterların açık girişleri kapanır (exitReason: AREA_CHANGED).',
  })
  @ApiOkResponse({ type: AreaResponseDto })
  @ApiNotFoundResponse({ description: 'Alan bulunamadı' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAreaDto,
  ): Promise<AreaResponseDto> {
    return AreaResponseDto.from(await this.areasService.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Alanı sil',
    description:
      'Yumuşak silme: alan listede ve konum işlemede yok sayılır, giriş kayıtları kalır. İçinde bulunulan girişler kapanır (exitReason: AREA_REMOVED).',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'Alan bulunamadı' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.areasService.remove(id);
  }
}
