import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

export interface HeartbeatOptions {
  /** Sunucunun ping gönderme aralığı (ms). */
  pingInterval: number;
  /** Ping'e bu süre içinde cevap vermeyen bağlantı kapatılır (ms). */
  pingTimeout: number;
}

/**
 * Socket.IO sunucusuna CORS ve ping ayarlarını config'ten verir. Gateway dekoratöründe
 * okumak config'i modül yüklenirken (doğrulanmadan) okumayı gerektiriyordu.
 * Ping'e cevap vermeyen (uygulaması kapanmış, ağı kopmuş) bağlantı kapatılır; ölü
 * bağlantılar bellekte ve oda listelerinde birikmez.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: boolean | string[],
    private readonly heartbeat: HeartbeatOptions,
  ) {
    super(app);
  }

  override createIOServer(
    port: number,
    options?: Parameters<IoAdapter['createIOServer']>[1],
  ) {
    return super.createIOServer(port, {
      ...options,
      ...this.heartbeat,
      cors: { origin: this.origin },
    } as typeof options);
  }
}
