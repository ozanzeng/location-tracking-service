import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Access } from './access.enum.js';
import { ACCESS } from './security.constants.js';

/**
 * Giriş yapmış herkes: API anahtarı, yönetici ya da sürücü. İşaretsiz uç noktalar API anahtarı
 * ya da yönetici ister (Access.OPERATOR).
 */
export const AllowRiders = () =>
  applyDecorators(
    SetMetadata(ACCESS, Access.ANY),
    ApiBearerAuth('rider'),
    ApiBearerAuth('admin'),
  );

/** Konum gönderenler: API anahtarı ya da sürücü. */
export const DevicesOnly = () =>
  applyDecorators(SetMetadata(ACCESS, Access.DEVICE), ApiBearerAuth('rider'));

/** Sadece giriş yapmış yönetici. */
export const AdminsOnly = () =>
  applyDecorators(SetMetadata(ACCESS, Access.ADMIN), ApiBearerAuth('admin'));

/** Sadece giriş yapmış sürücü. */
export const RidersOnly = () =>
  applyDecorators(SetMetadata(ACCESS, Access.RIDER), ApiBearerAuth('rider'));
