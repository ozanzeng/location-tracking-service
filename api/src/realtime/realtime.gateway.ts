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
import { USER_ID_MAX_LENGTH } from '../config/limits.js';
import { API_KEY_HEADER, apiKeyScope } from '../security/api-key.guard.js';
import { KeyScope } from '../security/key-scope.enum.js';
import { PositionBuffer } from './position-buffer.js';
import {
  isUserRoom,
  EVENTS_ROOM,
  MONITOR_ROOM,
  userRoom,
  type GeofenceUpdateMessage,
} from './realtime.constants.js';
import { RealtimeEvent } from './realtime-event.enum.js';
import { RealtimeSubscriber } from './realtime.subscriber.js';

interface SubscribePayload {
  monitor?: boolean;
  events?: boolean;
  userId?: string;
}

/**
 * Socket.IO tarafı: istemciler odalara abone olur (operasyon: monitor ya da yalnızca olaylar için
 * events, sürücü: kendi kullanıcısı).
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
      this.server.emit(RealtimeEvent.AREAS_CHANGED, message),
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
    const scope = apiKeyScope(this.config.security, provided);
    if (!scope) {
      client.disconnect(true);
      return;
    }
    (client.data as { scope?: KeyScope }).scope = scope;
  }

  @SubscribeMessage(RealtimeEvent.SUBSCRIBE)
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    // Tüm filonun yayını (konumlar ya da yalnızca olaylar) tam yetki ister; sürücü anahtarı
    // sadece kullanıcı odasına girer.
    const scope = (client.data as { scope?: KeyScope }).scope;
    if ((payload?.monitor || payload?.events) && scope !== KeyScope.FULL) {
      return {
        ok: false,
        error: 'filo aboneliği (monitor, events) tam yetkili anahtar ister',
      };
    }
    if (payload?.monitor) void client.join(MONITOR_ROOM);
    if (payload?.events) void client.join(EVENTS_ROOM);
    if (
      typeof payload?.userId === 'string' &&
      payload.userId.length <= USER_ID_MAX_LENGTH
    ) {
      const room = userRoom(payload.userId);
      // Sürücü anahtarıyla açılan bağlantı aynı anda tek kullanıcı odasında durur: yeni
      // kullanıcıya abone olunca öncekinden çıkar. Tek bağlantıyla tüm filo dinlenemez.
      // Birden çok bağlantı açan biri yine başka kullanıcıları dinleyebilir; bunun çözümü
      // userId'nin imzalı token'dan alınmasıdır (README, kapsam dışı).
      if (scope === KeyScope.INGEST) {
        for (const joined of client.rooms) {
          if (isUserRoom(joined) && joined !== room) void client.leave(joined);
        }
      }
      void client.join(room);
    }
    return { ok: true };
  }

  @SubscribeMessage(RealtimeEvent.UNSUBSCRIBE)
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    if (payload?.monitor) void client.leave(MONITOR_ROOM);
    if (payload?.events) void client.leave(EVENTS_ROOM);
    if (typeof payload?.userId === 'string') {
      void client.leave(userRoom(payload.userId));
    }
    return { ok: true };
  }

  private onUpdate(message: GeofenceUpdateMessage): void {
    this.positions.add(message.position);
    for (const event of message.events) {
      this.server
        .to([MONITOR_ROOM, EVENTS_ROOM, userRoom(event.userId)])
        .emit(RealtimeEvent.AREA_EVENT, event);
    }
  }

  private flushPositions(): void {
    const batch = this.positions.drain();
    if (batch.length === 0) return;
    this.server.to(MONITOR_ROOM).emit(RealtimeEvent.POSITIONS, batch);
    for (const position of batch) {
      this.server
        .to(userRoom(position.userId))
        .emit(RealtimeEvent.POSITION, position);
    }
  }
}
