import { useEffect, useState } from 'react';
import { SCOOTER_ID_KEY } from '../config';

function initialScooterId(): string {
  try {
    const saved = localStorage.getItem(SCOOTER_ID_KEY);
    if (saved) return saved;
  } catch {
    // Depolama kapalıysa her açılışta yeni kimlik.
  }
  return `scooter-${Math.floor(100 + Math.random() * 900)}`;
}

/** Scooter kimliği; tarayıcıda saklanır, sayfa yenilenince aynı kalır. */
export function useScooterId() {
  const [scooterId, setScooterId] = useState(initialScooterId);
  useEffect(() => {
    try {
      localStorage.setItem(SCOOTER_ID_KEY, scooterId);
    } catch {
      // yok say
    }
  }, [scooterId]);
  return [scooterId, setScooterId] as const;
}
