import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

/** Uygulama boyunca tek bağlantı; ekranlar sadece abonelik değiştirir. */
export function getSocket(): Socket {
  socket ??= io({ path: '/socket.io', transports: ['websocket'] });
  return socket;
}
