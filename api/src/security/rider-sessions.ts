import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { PrincipalKind } from './principal-kind.enum.js';
import type { RiderPrincipal } from './principal.js';

interface StoredSession {
  riderId: string;
  username: string;
}

/**
 * Sürücü oturumları Redis'te, süreli. Token'ın kendisi saklanmaz, SHA-256 özeti anahtar olur:
 * Redis'in bir kopyası sızsa bile oturumlar ele geçirilemez. Oturumun süresi sabittir
 * (RIDER_SESSION_TTL_HOURS); çıkışta hemen silinir. Redis kalıcı (AOF) olduğu için yeniden
 * başlatmada oturumlar düşmez; düşse bile sonuç sadece yeniden giriştir.
 *
 * JWT yerine opak token: çıkış ve hesap kapatma anında geçerli olur, imza anahtarı yönetimi
 * gerekmez. Bedeli her istekte bir Redis okuması; konum isteği zaten rate limit için Redis'e
 * gidiyor.
 */
@Injectable()
export class RiderSessions implements OnApplicationShutdown {
  private readonly redis: Redis;
  private readonly prefix: string;
  private readonly ttlSeconds: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.prefix = `${config.queue.prefix}:session`;
    this.ttlSeconds = config.security.riderSessionTtlSeconds;
    this.redis = createRedis(config.redisUrl, {
      failFast: true,
      lazyConnect: true,
      name: 'sürücü oturumları',
    });
  }

  async create(riderId: string, username: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const session: StoredSession = { riderId, username };
    await this.redis.set(
      this.key(token),
      JSON.stringify(session),
      'EX',
      this.ttlSeconds,
    );
    return token;
  }

  /** Token geçerliyse sürücü; süresi dolmuş ya da çıkış yapılmışsa null. */
  async resolve(token: string): Promise<RiderPrincipal | null> {
    const raw = await this.redis.get(this.key(token));
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    return {
      kind: PrincipalKind.RIDER,
      riderId: session.riderId,
      username: session.username,
    };
  }

  async revoke(token: string): Promise<void> {
    await this.redis.del(this.key(token));
  }

  get ttl(): number {
    return this.ttlSeconds;
  }

  private key(token: string): string {
    return `${this.prefix}:${createHash('sha256').update(token).digest('hex')}`;
  }

  async onApplicationShutdown(): Promise<void> {
    await closeRedis(this.redis);
  }
}
