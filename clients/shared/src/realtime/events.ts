/**
 * Socket.IO olay adları. API'deki karşılığı: api/src/realtime/realtime-event.enum.ts;
 * biri değişirse diğeri de değişmeli.
 */
export const SocketEvent = {
  /** İstemci → sunucu: kullanıcı odasına ya da tüm filonun yayınına abone ol. */
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  /** Sunucu → istemci: alana giriş ya da çıkış. */
  AREA_EVENT: 'area-event',
  /** Sunucu → kullanıcı odası: o kullanıcının son konumu. */
  POSITION: 'position',
  /** Sunucu → tüm filo: toplu konumlar. */
  POSITIONS: 'positions',
  /** Sunucu → herkes: yeni alan tanımlandı. */
  AREAS_CHANGED: 'areas-changed',
  /** Sunucu → herkes: scooter eklendi, silindi, kiralandı ya da bırakıldı. */
  SCOOTERS_CHANGED: 'scooters-changed',
  /** Socket.IO'nun kendi bağlantı olayları. */
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
} as const;
