import { AreaType } from '../api/types';

interface ZoneStyle {
  label: string;
  color: string;
  fill: string;
  fillOpacity: number;
  dashArray?: string;
}

export const ZONES: Record<AreaType, ZoneStyle> = {
  [AreaType.NO_RIDE]: { label: 'Sürüş yasak', color: '#B81D31', fill: '#D7263D', fillOpacity: 0.28 },
  [AreaType.SLOW]: { label: 'Yavaş bölge', color: '#C98B00', fill: '#F2A900', fillOpacity: 0.3 },
  [AreaType.NO_PARKING]: {
    label: 'Park yasak',
    color: '#1F5FAD',
    fill: '#D7263D',
    fillOpacity: 0.14,
    dashArray: '6 4',
  },
  [AreaType.PARKING]: { label: 'Park alanı', color: '#1F5FAD', fill: '#1F5FAD', fillOpacity: 0.28 },
  [AreaType.SERVICE]: {
    label: 'Hizmet bölgesi',
    color: '#2B2F36',
    fill: '#2B2F36',
    fillOpacity: 0.03,
    dashArray: '2 6',
  },
};

/** En kısıtlayıcıdan en serbeste. */
export const ZONE_ORDER: AreaType[] = [
  AreaType.NO_RIDE,
  AreaType.SLOW,
  AreaType.NO_PARKING,
  AreaType.PARKING,
  AreaType.SERVICE,
];

/** Scooter'ın rengini içinde bulunduğu en kısıtlayıcı bölge belirler. */
export function dominantZone(types: Iterable<AreaType>): AreaType | null {
  const set = new Set(types);
  return ZONE_ORDER.find((t) => set.has(t)) ?? null;
}
