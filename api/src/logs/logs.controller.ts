import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import { LogPageDto } from './dto/log-response.dto.js';
import { LogsService } from './logs.service.js';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Get()
  @ApiOperation({
    summary: 'Alan giriş logları',
    description:
      'Her kayıt bir alan girişidir; kullanıcı alandan çıktığında exitTime dolar. En yeni girişten eskiye, cursor ile sayfalanır.',
  })
  @ApiOkResponse({ type: LogPageDto })
  list(@Query() query: ListLogsQueryDto): Promise<LogPageDto> {
    return this.logsService.list(query);
  }
}
