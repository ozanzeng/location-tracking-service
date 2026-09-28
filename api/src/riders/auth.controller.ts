import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { RidersOnly } from '../security/access.decorator.js';
import { CurrentRider } from '../security/current-rider.decorator.js';
import { bearerToken } from '../security/principal.js';
import { Public } from '../security/public.decorator.js';
import { CredentialsDto } from './dto/credentials.dto.js';
import { RiderDto, SessionResponseDto } from './dto/session-response.dto.js';
import { RidersService } from './riders.service.js';
import type { RiderPrincipal } from '../security/security.types.js';

/** Sürücü hesabı: üyelik, giriş, çıkış. */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly riders: RidersService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Sürücü olarak üye ol (oturum da açılır)' })
  @ApiCreatedResponse({ type: SessionResponseDto })
  @ApiConflictResponse({ description: 'Bu kullanıcı adı alınmış' })
  register(@Body() dto: CredentialsDto): Promise<SessionResponseDto> {
    return this.riders.register(dto);
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Sürücü girişi' })
  @ApiOkResponse({ type: SessionResponseDto })
  @ApiUnauthorizedResponse({ description: 'Kullanıcı adı ya da şifre yanlış' })
  @ApiTooManyRequestsResponse({
    description: 'Çok fazla başarısız deneme; Retry-After kadar bekleyin',
  })
  login(@Body() dto: CredentialsDto): Promise<SessionResponseDto> {
    return this.riders.login(dto);
  }

  @Post('logout')
  @RidersOnly()
  @HttpCode(204)
  @ApiOperation({ summary: 'Oturumu kapat (token hemen geçersiz olur)' })
  @ApiNoContentResponse()
  async logout(@Req() req: Request): Promise<void> {
    const token = bearerToken(req);
    if (token) await this.riders.logout(token);
  }

  @Get('me')
  @RidersOnly()
  @ApiOperation({ summary: 'Oturumdaki sürücü' })
  @ApiOkResponse({ type: RiderDto })
  me(@CurrentRider() rider: RiderPrincipal): RiderDto {
    return { id: rider.riderId, username: rider.username };
  }
}
