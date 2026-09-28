import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../../config/limits.js';

/** Üyelik ve giriş: kullanıcı adı küçük harfe çevrilir ("Ali" ile "ali" aynı hesap). */
export class CredentialsDto {
  @ApiProperty({
    example: 'ali.yilmaz',
    minLength: USERNAME_MIN_LENGTH,
    maxLength: USERNAME_MAX_LENGTH,
    description: 'Küçük harf, rakam ve _ . - (büyük harf küçüğe çevrilir)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLocaleLowerCase('en-US') : value,
  )
  @IsString()
  @Matches(USERNAME_PATTERN, {
    message: `username ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} karakter olmalı; sadece harf, rakam ve _ . - içerebilir`,
  })
  username: string;

  @ApiProperty({
    example: 'guclu-bir-sifre',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `password en az ${PASSWORD_MIN_LENGTH} karakter olmalı`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password: string;
}
