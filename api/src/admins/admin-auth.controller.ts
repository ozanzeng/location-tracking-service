import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { CredentialsDto } from '../riders/dto/credentials.dto.js';
import { AdminsOnly } from '../security/access.decorator.js';
import { CurrentAdmin } from '../security/current-rider.decorator.js';
import { bearerToken } from '../security/principal.js';
import { Public } from '../security/public.decorator.js';
import { AdminsService } from './admins.service.js';
import { AdminDto, AdminSessionDto } from './dto/admin-session.dto.js';
import type { AdminPrincipal } from '../security/security.types.js';

/** Operasyon paneli yöneticisi: giriş, çıkış. Hesaplar API'den açılmaz (README). */
@ApiTags('auth')
@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly admins: AdminsService) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Yönetici girişi (operasyon paneli)' })
  @ApiOkResponse({ type: AdminSessionDto })
  @ApiUnauthorizedResponse({ description: 'Kullanıcı adı ya da şifre yanlış' })
  @ApiTooManyRequestsResponse({
    description: 'Çok fazla başarısız deneme; Retry-After kadar bekleyin',
  })
  login(@Body() dto: CredentialsDto): Promise<AdminSessionDto> {
    return this.admins.login(dto);
  }

  @Post('logout')
  @AdminsOnly()
  @HttpCode(204)
  @ApiBearerAuth('admin')
  @ApiOperation({
    summary: 'Yönetici oturumunu kapat (token hemen geçersiz olur)',
  })
  @ApiNoContentResponse()
  async logout(@Req() req: Request): Promise<void> {
    const token = bearerToken(req);
    if (token) await this.admins.logout(token);
  }

  @Get('me')
  @AdminsOnly()
  @ApiOperation({ summary: 'Oturumdaki yönetici' })
  @ApiOkResponse({ type: AdminDto })
  me(@CurrentAdmin() admin: AdminPrincipal): AdminDto {
    return { id: admin.adminId, username: admin.username };
  }
}
