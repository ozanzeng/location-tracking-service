import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import { PrincipalKind } from './principal-kind.enum.js';
import type {
  SessionPrincipal,
  SessionKind,
  StoredSession,
} from './security.types.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

/**
 * Sürücü ve yönetici oturumları Redis'te, süreli. Token'ın kendisi saklanmaz, SHA-256 özeti
 * anahtar olur: Redis'in bir kopyası sızsa bile oturumlar ele geçirilemez. Oturumun süresi
 * sabittir (RIDER_SESSION_TTL_HOURS, ADMIN_SESSION_TTL_HOURS); çıkışta hemen silinir. Redis
 * kalıcı (AOF) olduğu için yeniden başlatmada oturumlar düşmez; düşse bile sonuç sadece
 * yeniden giriştir.
 *
 * Token'ın kime ait olduğu kayıttadır: aynı istekte hangi tür oturum olduğunu anlamak için
 * tek bir Redis okuması yeter.
 *
 * JWT yerine opak token: çıkış ve hesap kapatma anında geçerli olur, imza anahtarı yönetimi
 * gerekmez. Bedeli her istekte bir Redis okuması; konum isteği zaten rate limit için Redis'e
 * gidiyor.
 */
@Injectable()
export class Sessions implements OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly ttlSeconds: Record<SessionKind, number>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    // Önek ilk sürümle aynı: güncellemede açık sürücü oturumları düşmez.
    this.prefix = `${config.queue.prefix}:session`;
    this.ttlSeconds = {
      [PrincipalKind.RIDER]: config.security.riderSessionTtlSeconds,
      [PrincipalKind.ADMIN]: config.security.adminSessionTtlSeconds,
    };
    this.redis = createRedis(config.redisUrl, {
      failFast: true,
      lazyConnect: true,
      name: 'oturumlar',
    });
  }

  async create(principal: SessionPrincipal): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const session: StoredSession = {
      kind: principal.kind,
      id:
        principal.kind === PrincipalKind.RIDER
          ? principal.riderId
          : principal.adminId,
      username: principal.username,
    };
    await this.redis.set(
      this.key(token),
      JSON.stringify(session),
      'EX',
      this.ttlSeconds[principal.kind],
    );
    return token;
  }

  /** Token geçerliyse kimlik; süresi dolmuş ya da çıkış yapılmışsa null. */
  async resolve(token: string): Promise<SessionPrincipal | null> {
    const raw = await this.redis.get(this.key(token));
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    const id = session.id ?? session.riderId ?? '';
    return session.kind === PrincipalKind.ADMIN
      ? { kind: PrincipalKind.ADMIN, adminId: id, username: session.username }
      : { kind: PrincipalKind.RIDER, riderId: id, username: session.username };
  }

  async revoke(token: string): Promise<void> {
    await this.redis.del(this.key(token));
  }

  /** Oturumun geçerlilik süresi (saniye). */
  ttl(kind: SessionKind): number {
    return this.ttlSeconds[kind];
  }

  private key(token: string): string {
    return `${this.prefix}:${createHash('sha256').update(token).digest('hex')}`;
  }

  async onApplicationShutdown(): Promise<void> {
    await closeRedis(this.redis);
  }
}
