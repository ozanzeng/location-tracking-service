import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginThrottle } from '../riders/login-throttle.js';
import {
  dummyPasswordHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../riders/password.js';
import type { CredentialsDto } from '../riders/dto/credentials.dto.js';
import { PrincipalKind } from '../security/principal-kind.enum.js';
import { Sessions } from '../security/sessions.js';
import { Admin } from './admin.entity.js';
import type { AdminSessionDto } from './dto/admin-session.dto.js';

/** Başarısız deneme sayacında sürücü adlarıyla karışmasın (adlarda ':' olamaz). */
const throttleKey = (username: string) => `admin:${username}`;

/**
 * Operasyon paneli girişi. Sürücü girişiyle aynı kurallar: aynı hata mesajı ve yaklaşık aynı
 * süre (hangi adların yönetici olduğu anlaşılmasın), kullanıcı adı başına başarısız deneme
 * sınırı, eski özetin girişte yenilenmesi.
 */
@Injectable()
export class AdminsService {
  private readonly logger = new Logger('Audit');

  constructor(
    @InjectRepository(Admin) private readonly admins: Repository<Admin>,
    private readonly sessions: Sessions,
    private readonly throttle: LoginThrottle,
  ) {}

  async login(dto: CredentialsDto): Promise<AdminSessionDto> {
    await this.throttle.assertAllowed(throttleKey(dto.username));
    const admin = await this.admins.findOne({
      where: { username: dto.username },
      select: { id: true, username: true, passwordHash: true },
    });
    const valid = await verifyPassword(
      dto.password,
      admin?.passwordHash ?? (await dummyPasswordHash()),
    );
    if (!admin || !valid) {
      await this.throttle.recordFailure(throttleKey(dto.username));
      this.logger.warn(`Başarısız yönetici girişi: ${dto.username}`);
      throw new UnauthorizedException('Kullanıcı adı ya da şifre yanlış');
    }
    await this.throttle.reset(throttleKey(dto.username));
    const changes: Partial<Admin> = { lastLoginAt: new Date() };
    if (needsRehash(admin.passwordHash)) {
      changes.passwordHash = await hashPassword(dto.password);
    }
    // Son giriş anı yazılamazsa (ör. veritabanı yükte) giriş yine olur.
    await this.admins.update(admin.id, changes).catch(() => undefined);
    this.logger.log(`Yönetici girişi: ${admin.username}`);
    return {
      token: await this.sessions.create({
        kind: PrincipalKind.ADMIN,
        adminId: admin.id,
        username: admin.username,
      }),
      expiresIn: this.sessions.ttl(PrincipalKind.ADMIN),
      admin: { id: admin.id, username: admin.username },
    };
  }

  logout(token: string): Promise<void> {
    return this.sessions.revoke(token);
  }
}
