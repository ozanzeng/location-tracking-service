import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';

/**
 * Socket.IO sunucusuna CORS ayarını config'ten verir. Gateway dekoratöründe okumak
 * config'i modül yüklenirken (doğrulanmadan) okumayı gerektiriyordu.
 */
export class CorsIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly origin: boolean | string[],
  ) {
    super(app);
  }

  override createIOServer(
    port: number,
    options?: Parameters<IoAdapter['createIOServer']>[1],
  ) {
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.origin },
    } as typeof options);
  }
}
