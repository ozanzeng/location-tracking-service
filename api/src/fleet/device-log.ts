import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import {
  closeRedis,
  createRedis,
  throttledErrorLogger,
} from '../common/redis/create-redis.js';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import type { AreaEventType } from '../geofence/area-event-type.enum.js';
import type { AreaRef } from '../geofence/geofence.types.js';
import { DeviceLogResult } from './device-log-result.enum.js';

/** Cihaz günlüğünün bir satırı: sunucunun bir konumla ne yaptığı. */
export interface DeviceLogEntry {
  /** API'nin konumu kabul edip kuyruğa aldığı an. */
  receivedAt: string;
  /** Worker'ın konumu işlediği an. */
  processedAt: string;
  /** Konumun cihazda ölçüldüğü an (gönderilen timestamp). */
  recordedAt: string;
  lat: number;
  lng: number;
  result: DeviceLogResult;
  /** Bu konumla girilen ya da çıkılan alanlar. */
  events: Array<{ type: AreaEventType; area: AreaRef }>;
  /** İsteğin kimliği; API ve worker loglarında aynı istek bununla bulunur. */
  requestId?: string;
}

/**
 * Sunucu tarafı cihaz günlüğü: scooter başına son işlenen konumlar, Redis'te sınırlı bir liste
 * (DEVICE_LOG_SIZE, varsayılan 50) ve süreli (DEVICE_LOG_TTL_HOURS). Operasyon ekranı bir
 * scooter'ın son dakikalarda ne gönderdiğini ve sunucunun ne yaptığını görsün diye.
 *
 * Konum geçmişi veritabanına yazılmaz (bkz. README, veri modeli): bu liste kısa süreli bir
 * teşhis kaydıdır, kalıcı değil. Worker iş başına tek Redis isteğiyle yazar; yazılamazsa konum
 * işleme etkilenmez, sadece günlükte boşluk kalır. API'nin reddettiği istekler (kayıtsız
 * scooter, kiralama yok, rate limit) worker'a ulaşmadığı için burada görünmez.
 */
@Injectable()
export class DeviceLog implements OnApplicationShutdown {
  private readonly redis: Redis | null;
  private readonly prefix: string;
  private readonly size: number;
  private readonly ttlSeconds: number;
  private readonly logError = throttledErrorLogger('Cihaz günlüğü yazılamadı');

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.prefix = `${config.queue.prefix}:device-log`;
    this.size = config.observability.deviceLogSize;
    this.ttlSeconds = config.observability.deviceLogTtlSeconds;
    this.redis =
      this.size > 0
        ? createRedis(config.redisUrl, {
            lazyConnect: true,
            failFast: true,
            name: 'cihaz günlüğü',
          })
        : null;
  }

  /** Worker: bir işin konumları, işlendiği sırayla. Hata fırlatmaz. */
  async record(scooterId: string, entries: DeviceLogEntry[]): Promise<void> {
    if (!this.redis || entries.length === 0) return;
    const key = this.key(scooterId);
    try {
      await this.redis
        .multi()
        // En yeni başta: son işlenen en son eklenir.
        .lpush(key, ...entries.map((e) => JSON.stringify(e)))
        .ltrim(key, 0, this.size - 1)
        .expire(key, this.ttlSeconds)
        .exec();
    } catch (err) {
      this.logError(err as Error);
    }
  }

  /** API: en yeni başta. */
  async read(scooterId: string): Promise<DeviceLogEntry[]> {
    if (!this.redis) return [];
    const raw = await this.redis.lrange(this.key(scooterId), 0, this.size - 1);
    return raw.map((r) => JSON.parse(r) as DeviceLogEntry);
  }

  private key(scooterId: string): string {
    return `${this.prefix}:${scooterId}`;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.redis) await closeRedis(this.redis);
  }
}
