/** Giriş kayıtlarında "durum" filtresi. */
export const LogStatusFilter = {
  ALL: 'all',
  /** Hâlâ alanın içinde (çıkış zamanı yok). */
  INSIDE: 'inside',
  /** Alandan çıkmış. */
  LEFT: 'left',
} as const;

export type LogStatusFilter = (typeof LogStatusFilter)[keyof typeof LogStatusFilter];

/** Kayıtlar ekranının filtreleri. */
export interface LogFilters {
  userId: string;
  areaId: string;
  status: LogStatusFilter;
  /** datetime-local değeri (yerel saat) */
  from: string;
  to: string;
}

/** Kayıtlar ekranında bir girişin durumu. */
export const VisitStatus = {
  /** Açık giriş, kullanıcı konum gönderiyor. */
  INSIDE: 'inside',
  /** Açık giriş ama kullanıcıdan bir süredir konum gelmiyor: "içeride" son bilinen durum. */
  NO_SIGNAL: 'no-signal',
  /** Kullanıcı alandan çıktı. */
  LEFT: 'left',
  /** Konumu gelmediği için sunucu kapattı; çıkış zamanı kapatıldığı an. */
  SIGNAL_LOST: 'signal-lost',
  /** Alanın şekli değişti, kullanıcının son konumu yeni şeklin dışında kaldı. */
  AREA_CHANGED: 'area-changed',
  /** Alan silindi. */
  AREA_REMOVED: 'area-removed',
} as const;

export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus];
