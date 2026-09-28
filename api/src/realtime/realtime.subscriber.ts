import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { closeRedis, createRedis } from '../common/redis/create-redis.js';
import type { FleetChangedMessage } from '../fleet/fleet.types.js';
import { fleetChannel } from '../fleet/fleet-events.js';
import type {
  AreasChangedMessage,
  GeofenceUpdateMessage,
  Handler,
} from './realtime.types.js';
import { areasChannel, updatesChannel } from './channels.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

/**
 * Worker'ların ve diğer API instance'larının Redis'e yayınladığı mesajları dinler.
 * Her API instance kendi aboneliğini açtığı için yatay ölçeklemede de çalışır.
 */
@Injectable()
export class RealtimeSubscriber implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeSubscriber.name);
  private redis: Redis | null = null;
  private readonly updateHandlers: Handler<GeofenceUpdateMessage>[] = [];
  private readonly areasHandlers: Handler<AreasChangedMessage>[] = [];
  private readonly fleetHandlers: Handler<FleetChangedMessage>[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  onUpdate(handler: Handler<GeofenceUpdateMessage>): void {
    this.updateHandlers.push(handler);
  }

  onAreasChanged(handler: Handler<AreasChangedMessage>): void {
    this.areasHandlers.push(handler);
  }

  onFleetChanged(handler: Handler<FleetChangedMessage>): void {
    this.fleetHandlers.push(handler);
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.realtime.enabled) return;
    const updates = updatesChannel(this.config.queue.prefix);
    const areas = areasChannel(this.config.queue.prefix);
    const fleet = fleetChannel(this.config.queue.prefix);

    this.redis = createRedis(this.config.redisUrl, {
      name: 'canlı yayın aboneliği',
    });
    this.redis.on('message', (channel: string, raw: string) => {
      if (channel === updates) this.dispatch(raw, this.updateHandlers);
      else if (channel === areas) this.dispatch(raw, this.areasHandlers);
      else if (channel === fleet) this.dispatch(raw, this.fleetHandlers);
    });
    // Beklenmez: Redis açılışta erişilemezse API yine ayağa kalkar (/logs, /areas ve 503 veren
    // /health çalışsın). ioredis bağlantı gelince aboneliği kendisi kurar ve kopunca yeniler.
    this.redis
      .subscribe(updates, areas, fleet)
      .catch((err: Error) =>
        this.logger.warn(`Canlı yayın aboneliği kurulamadı: ${err.message}`),
      );
  }

  /**
   * HTTP sunucusu ve soketler kapandıktan sonra (Nest: onModuleDestroy → sunucu kapanışı →
   * onApplicationShutdown): kapanırken işlenmekte olan istekler bağlantıyı hâlâ kullanır.
   */
  async onApplicationShutdown(): Promise<void> {
    if (this.redis) await closeRedis(this.redis);
  }

  /**
   * Bozuk bir mesaj süreci düşürmesin; atlanır. ioredis 'message' dinleyicisinden kaçan
   * hata yakalanmamış istisnadır ve API'yi düşürür. Bu yüzden JSON'u geçerli ama biçimi
   * beklenmedik mesajda (ör. farklı sürümden yayın) işleyicinin hatası da yakalanır. Bir
   * işleyicinin hatası diğerlerini engellemez.
   */
  dispatch<T>(raw: string, handlers: Handler<T>[]): void {
    let message: T;
    try {
      message = JSON.parse(raw) as T;
    } catch {
      this.logger.warn('Geçersiz yayın mesajı atlandı');
      return;
    }
    for (const handler of handlers) {
      try {
        handler(message);
      } catch (err) {
        this.logger.warn(
          `Yayın mesajı işlenemedi, atlandı: ${(err as Error).message}`,
        );
      }
    }
  }
}
