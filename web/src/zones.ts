import type { AreaType, EventType } from './api';

interface ZoneStyle {
  label: string;
  color: string;
  fill: string;
  fillOpacity: number;
  dashArray?: string;
}

export const ZONES: Record<AreaType, ZoneStyle> = {
  NO_RIDE: { label: 'Sürüş yasak', color: '#B81D31', fill: '#D7263D', fillOpacity: 0.28 },
  SLOW: { label: 'Yavaş bölge', color: '#C98B00', fill: '#F2A900', fillOpacity: 0.3 },
  NO_PARKING: { label: 'Park yasak', color: '#1F5FAD', fill: '#D7263D', fillOpacity: 0.14, dashArray: '6 4' },
  PARKING: { label: 'Park alanı', color: '#1F5FAD', fill: '#1F5FAD', fillOpacity: 0.28 },
  SERVICE: { label: 'Hizmet bölgesi', color: '#2B2F36', fill: '#2B2F36', fillOpacity: 0.03, dashArray: '2 6' },
};

export const ZONE_ORDER: AreaType[] = ['NO_RIDE', 'SLOW', 'NO_PARKING', 'PARKING', 'SERVICE'];

/** Scooter'ın rengini içinde bulunduğu en kısıtlayıcı bölge belirler. */
export function dominantZone(types: Iterable<AreaType>): AreaType | null {
  const set = new Set(types);
  return ZONE_ORDER.find((t) => set.has(t)) ?? null;
}

export function scooterColor(types: Iterable<AreaType>): string {
  const set = new Set(types);
  if (!set.has('SERVICE') && !set.has('NO_RIDE')) return '#8A8F98';
  const zone = dominantZone(set);
  if (zone === 'NO_RIDE') return '#D7263D';
  if (zone === 'SLOW') return '#F2A900';
  if (zone === 'PARKING') return '#1F5FAD';
  return '#2B2F36';
}

/** Sürücüye gösterilecek levha metni (Martı uygulaması bildirimleri gibi). */
export function riderMessage(type: AreaType, event: EventType): { title: string; body: string } {
  const messages: Record<AreaType, Record<EventType, { title: string; body: string }>> = {
    NO_RIDE: {
      ENTER: { title: 'Sürüş yasak bölge', body: 'Scooter durduruldu. Bölgeden yürüterek çıkın.' },
      EXIT: { title: 'Yasak bölgeden çıktınız', body: 'Sürüşe devam edebilirsiniz.' },
    },
    SLOW: {
      ENTER: { title: 'Yavaş bölge', body: 'Hızınız 10 km/s ile sınırlandı.' },
      EXIT: { title: 'Yavaş bölge bitti', body: 'Normal hız sınırı geri geldi.' },
    },
    NO_PARKING: {
      ENTER: { title: 'Park yasak', body: 'Sürüşü burada bitiremezsiniz.' },
      EXIT: { title: 'Park yasağı bitti', body: 'Uygun bir park alanı arayın.' },
    },
    PARKING: {
      ENTER: { title: 'Park alanı', body: 'Sürüşü burada bitirebilirsiniz.' },
      EXIT: { title: 'Park alanından çıktınız', body: 'En yakın park alanı haritada mavi.' },
    },
    SERVICE: {
      ENTER: { title: 'Hizmet bölgesindesiniz', body: 'İyi sürüşler.' },
      EXIT: { title: 'Hizmet bölgesi dışı', body: 'Geri dönün; bölge dışında sürüş bitirilemez.' },
    },
  };
  return messages[type][event];
}
