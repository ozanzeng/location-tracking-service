import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let token: string | null = null;

/**
 * Uygulama boyunca tek bağlantı; ekranlar sadece abonelik değiştirir. Oturum (sürücü ya da
 * yönetici) token'ı el sıkışmada gider (auth.token).
 */
export function getSocket(): Socket {
  socket ??= io({
    path: '/socket.io',
    transports: ['websocket'],
    auth: (cb) => cb(token ? { token } : {}),
  });
  return socket;
}

/** Giriş ve çıkışta: bağlantı yeni kimlikle yeniden kurulur. */
export function setSocketAuth(next: string | null): void {
  if (next === token) return;
  token = next;
  if (socket) socket.disconnect().connect();
}
