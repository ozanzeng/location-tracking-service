import { useEffect, useState } from 'react';
import { getSocket } from '@shared/realtime/socket';

/** Canlı yayın bağlantısının açık olup olmadığı. */
export function useSocketConnected(): boolean {
  const [connected, setConnected] = useState(() => getSocket().connected);
  useEffect(() => {
    const socket = getSocket();
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);
  return connected;
}
