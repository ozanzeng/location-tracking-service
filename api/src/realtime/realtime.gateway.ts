import {
  Inject,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import type { PositionUpdate } from '../geofence/geofence.types.js';
import { createRedis } from '../queue/redis-connection.js';
import {
  GEOFENCE_UPDATES_CHANNEL,
  MONITOR_ROOM,
  userRoom,
  type GeofenceUpdateMessage,
} from './realtime.constants.js';

interface SubscribePayload {
  monitor?: boolean;
  userId?: string;
}

/**
 * Worker'ların Redis'e yayınladığı sonuçları Socket.IO client'larına iletir.
 * Her API instance kendi aboneliğini açtığı için yatay ölçeklemede de çalışır.
 * Pozisyonlar yük altında client'ları boğmasın diye kullanıcı başına son değer
 * tutulup belirli aralıklarla toplu gönderilir; alan olayları anında gider.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class RealtimeGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RealtimeGateway.name);
  private subscriber: Redis | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private pending = new Map<string, PositionUpdate>();

  @WebSocketServer()
  server: Server;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.realtime.enabled) return;

    this.subscriber = createRedis(this.config.redisUrl);
    this.subscriber.on('message', (_channel, raw) => this.onUpdate(raw));
    await this.subscriber.subscribe(GEOFENCE_UPDATES_CHANNEL);

    this.flushTimer = setInterval(
      () => this.flushPositions(),
      this.config.realtime.flushIntervalMs,
    );
  }

  async onModuleDestroy(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.subscriber?.quit();
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    if (payload?.monitor) void client.join(MONITOR_ROOM);
    if (typeof payload?.userId === 'string' && payload.userId.length <= 64) {
      void client.join(userRoom(payload.userId));
    }
    return { ok: true };
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    if (payload?.monitor) void client.leave(MONITOR_ROOM);
    if (typeof payload?.userId === 'string') {
      void client.leave(userRoom(payload.userId));
    }
    return { ok: true };
  }

  private onUpdate(raw: string): void {
    let message: GeofenceUpdateMessage;
    try {
      message = JSON.parse(raw) as GeofenceUpdateMessage;
    } catch {
      this.logger.warn('Geçersiz yayın mesajı atlandı');
      return;
    }

    this.pending.set(message.position.userId, message.position);
    for (const event of message.events) {
      this.server
        .to([MONITOR_ROOM, userRoom(event.userId)])
        .emit('area-event', event);
    }
  }

  private flushPositions(): void {
    if (this.pending.size === 0) return;
    const batch = [...this.pending.values()];
    this.pending = new Map();
    this.server.to(MONITOR_ROOM).emit('positions', batch);
    for (const position of batch) {
      this.server.to(userRoom(position.userId)).emit('position', position);
    }
  }
}
