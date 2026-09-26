import {
  Inject,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { API_KEY_HEADER, isValidApiKey } from '../security/api-key.guard.js';
import { PositionBuffer } from './position-buffer.js';
import {
  MONITOR_ROOM,
  userRoom,
  type GeofenceUpdateMessage,
} from './realtime.constants.js';
import { RealtimeSubscriber } from './realtime.subscriber.js';

interface SubscribePayload {
  monitor?: boolean;
  userId?: string;
}

/**
 * Socket.IO tarafı: istemciler odalara abone olur (operasyon: monitor, sürücü: kendi kullanıcısı).
 * Alan olayları anında gider; konumlar tamponlanıp belirli aralıklarla toplu gönderilir.
 */
// CORS ayarı CorsIoAdapter'dan gelir (setup-app.ts).
@WebSocketGateway()
export class RealtimeGateway
  implements OnModuleInit, OnModuleDestroy, OnGatewayConnection
{
  private readonly positions = new PositionBuffer();
  private flushTimer: NodeJS.Timeout | null = null;

  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly subscriber: RealtimeSubscriber,
  ) {}

  onModuleInit(): void {
    if (!this.config.realtime.enabled) return;
    this.subscriber.onUpdate((message) => this.onUpdate(message));
    // Alan listesi herkese açık bilgi; tüm bağlı istemcilere iletilir.
    this.subscriber.onAreasChanged((message) =>
      this.server.emit('areas-changed', message),
    );
    this.flushTimer = setInterval(
      () => this.flushPositions(),
      this.config.realtime.flushIntervalMs,
    );
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  /** HTTP ile aynı anahtar kuralı; geçersizse bağlantı hemen kapatılır. */
  handleConnection(client: Socket): void {
    const provided =
      client.handshake.headers[API_KEY_HEADER] ?? client.handshake.auth?.apiKey;
    if (!isValidApiKey(this.config.security.apiKeys, provided)) {
      client.disconnect(true);
    }
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

  private onUpdate(message: GeofenceUpdateMessage): void {
    this.positions.add(message.position);
    for (const event of message.events) {
      this.server
        .to([MONITOR_ROOM, userRoom(event.userId)])
        .emit('area-event', event);
    }
  }

  private flushPositions(): void {
    const batch = this.positions.drain();
    if (batch.length === 0) return;
    this.server.to(MONITOR_ROOM).emit('positions', batch);
    for (const position of batch) {
      this.server.to(userRoom(position.userId)).emit('position', position);
    }
  }
}
