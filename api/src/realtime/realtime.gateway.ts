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
import { USER_ID_MAX_LENGTH } from '../config/limits.js';
import { RentalsService } from '../fleet/rentals.service.js';
import { isValidApiKey } from '../security/auth.guard.js';
import { isRider, parseBearer } from '../security/principal.js';
import { Sessions } from '../security/sessions.js';
import { PositionBuffer } from './position-buffer.js';
import { EVENTS_ROOM, MONITOR_ROOM } from './realtime.constants.js';
import { RealtimeEvent } from './realtime-event.enum.js';
import { RealtimeSubscriber } from './realtime.subscriber.js';
import type {
  GeofenceUpdateMessage,
  SubscribePayload,
  ClientData,
} from './realtime.types.js';
import { isUserRoom, userRoom } from './channels.js';
import type { Principal } from '../security/security.types.js';
import {
  SERVICE_PRINCIPAL,
  API_KEY_HEADER,
} from '../security/security.constants.js';
import type { AppConfig } from '../config/configuration.types.js';
import { APP_CONFIG } from '../config/config.constants.js';

/**
 * Socket.IO tarafı: istemciler odalara abone olur (operasyon: monitor ya da yalnızca olaylar için
 * events, sürücü: kiraladığı scooter).
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
    private readonly sessions: Sessions,
    private readonly rentals: RentalsService,
  ) {}

  onModuleInit(): void {
    if (!this.config.realtime.enabled) return;
    this.subscriber.onUpdate((message) => this.onUpdate(message));
    // Alan listesi herkese açık bilgi; tüm bağlı istemcilere iletilir.
    this.subscriber.onAreasChanged((message) =>
      this.server.emit(RealtimeEvent.AREAS_CHANGED, message),
    );
    // Sürücülerin seçim ekranı ve operasyonun filo listesi yenilensin. Mesajda kimin kiraladığı
    // yok, sadece scooter kimliği.
    this.subscriber.onFleetChanged((message) =>
      this.server.emit(RealtimeEvent.SCOOTERS_CHANGED, message),
    );
    this.flushTimer = setInterval(
      () => this.flushPositions(),
      this.config.realtime.flushIntervalMs,
    );
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  /**
   * HTTP ile aynı kimlik kuralı: oturum (auth.token; sürücü ya da yönetici) ya da API anahtarı. Geçersizse
   * bağlantı kapatılır.
   */
  handleConnection(client: Socket): void {
    const data = client.data as ClientData;
    data.auth = this.authenticate(client).then(
      (principal) => {
        if (!principal) client.disconnect(true);
        return principal;
      },
      () => {
        // Oturum okunamadı (Redis erişilemiyor): istemci yeniden bağlanır.
        client.disconnect(true);
        return null;
      },
    );
  }

  private async authenticate(client: Socket): Promise<Principal | null> {
    const token = parseBearer(
      client.handshake.auth?.token
        ? `Bearer ${client.handshake.auth.token}`
        : client.handshake.headers.authorization,
    );
    if (token) return this.sessions.resolve(token);
    const provided =
      client.handshake.headers[API_KEY_HEADER] ?? client.handshake.auth?.apiKey;
    return isValidApiKey(this.config.security.apiKeys, provided)
      ? SERVICE_PRINCIPAL
      : null;
  }

  @SubscribeMessage(RealtimeEvent.SUBSCRIBE)
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ) {
    const principal = await (client.data as ClientData).auth;
    if (!principal) return { ok: false, error: 'kimlik doğrulanamadı' };
    // Tüm filonun yayını (konumlar ya da yalnızca olaylar) API anahtarı ister.
    if ((payload?.monitor || payload?.events) && isRider(principal)) {
      return {
        ok: false,
        error:
          'filo aboneliği (monitor, events) API anahtarı ya da yönetici oturumu ister',
      };
    }
    if (payload?.monitor) void client.join(MONITOR_ROOM);
    if (payload?.events) void client.join(EVENTS_ROOM);
    if (
      typeof payload?.userId === 'string' &&
      payload.userId.length <= USER_ID_MAX_LENGTH
    ) {
      const room = userRoom(payload.userId);
      // Sürücü sadece kiraladığı scooter'ı dinler; aynı anda tek odada durur.
      if (isRider(principal)) {
        const rented = await this.rentals.activeScooter(principal.riderId);
        if (rented !== payload.userId) {
          return { ok: false, error: `${payload.userId} size kiralı değil` };
        }
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
    if (message.position) this.positions.add(message.position);
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
