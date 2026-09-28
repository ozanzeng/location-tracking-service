import { MoveMode } from './route.types';

/** Hareket modlarının düğme etiketleri. */
export const MODE_LABELS: Record<MoveMode, string> = { [MoveMode.DRAG]: 'Sürükle', [MoveMode.ROUTE]: 'Rota çiz' };

/** Çizilen rotanın çizgisi. */
export const ROUTE_LINE_STYLE = {
  color: '#1F5FAD',
  weight: 4,
  opacity: 0.85,
  lineCap: 'round',
  lineJoin: 'round',
} as const;

/** Rota durağı. */
export const ROUTE_STOP_STYLE = { color: '#1F5FAD', weight: 2, fillColor: '#1F5FAD', fillOpacity: 1 };

/** Üzerine gelinen (tıklanınca silinecek) durak. */
export const ROUTE_STOP_REMOVE_STYLE = { color: '#fff', weight: 2, fillColor: '#D7263D', fillOpacity: 1 };
