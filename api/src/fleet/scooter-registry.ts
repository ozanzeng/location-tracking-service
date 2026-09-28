import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { DataSource } from 'typeorm';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import { RetryableHttpException } from '../common/http/retryable.exception.js';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { SCOOTER_REGISTRY_REFRESH_MS } from '../config/limits.js';
import { FleetChange } from './fleet-change.enum.js';
import { fleetChannel, type FleetChangedMessage } from './fleet.constants.js';

/**
 * Kayıtlı (silinmemiş) scooter kimlikleri, her API instance'ının belleğinde. Konum isteği bu
 * listeye bakar, veritabanına gitmez: API konumları veritabanına dokunmadan kabul eder, bu
 * kontrol de o özelliği bozmaz. Filo binler mertebesinde olduğu için liste küçüktür.
 *
 * Liste açılışta yüklenir; scooter eklenince ya da silinince FleetEvents duyurusuyla tüm
 * instance'larda yenilenir, duyuru kaçarsa dakikada bir. Veritabanı sonradan erişilemezse
 * bilinen son liste kullanılır. Açılışta hiç yüklenemediyse konumlar 503 alır (istemci tekrar
 * dener): kayıtsız kimlikleri kabul etmektense beklemek.
 */
@Injectable()
export class ScooterRegistry implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ScooterRegistry.name);
  private ids: Set<string> | null = null;
  private subscriber: Redis | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    const channel = fleetChannel(this.config.queue.prefix);
    this.subscriber = createRedis(this.config.redisUrl, {
      name: 'filo duyuru aboneliği',
    });
    this.subscriber.on('message', (_channel: string, raw: string) => {
      try {
        const message = JSON.parse(raw) as FleetChangedMessage;
        if (message.change === FleetChange.SCOOTERS) void this.refresh();
      } catch {
        // Bozuk mesaj: periyodik yenileme yine düzeltir.
      }
    });
    // Beklenmez: Redis açılışta erişilemezse API yine ayağa kalksın.
    this.subscriber
      .subscribe(channel)
      .catch((err: Error) =>
        this.logger.warn(`Filo duyurularına abone olunamadı: ${err.message}`),
      );
    this.timer = setInterval(
      () => void this.refresh(),
      SCOOTER_REGISTRY_REFRESH_MS,
    );
    this.timer.unref();
    await this.refresh();
  }

  async refresh(): Promise<void> {
    try {
      const rows: Array<{ id: string }> = await this.dataSource.query(
        'SELECT id FROM scooters WHERE deleted_at IS NULL',
      );
      this.ids = new Set(rows.map((r) => r.id));
    } catch (err) {
      this.logger.warn(
        `Scooter listesi yenilenemedi${this.ids ? ', bilinen son liste kullanılıyor' : ''}: ${(err as Error).message}`,
      );
    }
  }

  /** Bu instance'ta hemen geçerli olsun (diğerleri duyuruyla yenilenir). */
  added(id: string): void {
    this.ids?.add(id);
  }

  removed(id: string): void {
    this.ids?.delete(id);
  }

  /** Kayıtlı olmayan kimlik varsa 400; liste hiç yüklenemediyse 503. */
  assertRegistered(scooterIds: Iterable<string>): void {
    if (!this.ids) {
      throw new RetryableHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Scooter listesi henüz yüklenemedi; biraz sonra tekrar deneyin',
        5,
      );
    }
    const unknown = [...new Set(scooterIds)].filter((id) => !this.ids!.has(id));
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Kayıtlı olmayan scooter: ${unknown.slice(0, 10).join(', ')}${unknown.length > 10 ? ` (+${unknown.length - 10})` : ''}`,
      );
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.subscriber) await closeRedis(this.subscriber);
  }
}
