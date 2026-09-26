import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import { createRedis } from '../common/redis/create-redis.js';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import {
  areasChannel,
  updatesChannel,
  type AreasChangedMessage,
  type GeofenceUpdateMessage,
} from './realtime.constants.js';

type Handler<T> = (message: T) => void;

/**
 * Worker'ların ve diğer API instance'larının Redis'e yayınladığı mesajları dinler.
 * Her API instance kendi aboneliğini açtığı için yatay ölçeklemede de çalışır.
 */
@Injectable()
export class RealtimeSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeSubscriber.name);
  private redis: Redis | null = null;
  private readonly updateHandlers: Handler<GeofenceUpdateMessage>[] = [];
  private readonly areasHandlers: Handler<AreasChangedMessage>[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  onUpdate(handler: Handler<GeofenceUpdateMessage>): void {
    this.updateHandlers.push(handler);
  }

  onAreasChanged(handler: Handler<AreasChangedMessage>): void {
    this.areasHandlers.push(handler);
  }

  async onModuleInit(): Promise<void> {
    if (!this.config.realtime.enabled) return;
    const updates = updatesChannel(this.config.queue.prefix);
    const areas = areasChannel(this.config.queue.prefix);

    this.redis = createRedis(this.config.redisUrl);
    this.redis.on('message', (channel: string, raw: string) => {
      if (channel === updates) this.dispatch(raw, this.updateHandlers);
      else if (channel === areas) this.dispatch(raw, this.areasHandlers);
    });
    await this.redis.subscribe(updates, areas);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
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
