import { useEffect, useState } from 'react';
import { SocketEvent } from '@shared/realtime/events';
import { getSocket } from '@shared/realtime/socket';

/** Canlı yayın bağlantısının açık olup olmadığı. */
export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on(SocketEvent.CONNECT, onConnect);
    socket.on(SocketEvent.DISCONNECT, onDisconnect);
    return () => {
      socket.off(SocketEvent.CONNECT, onConnect);
      socket.off(SocketEvent.DISCONNECT, onDisconnect);
    };
  }, []);
  return connected;
}
