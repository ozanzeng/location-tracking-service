/** Cihaz günlüğü satırının türü (CSS'te device-log__item--<tür>). */
export const LogKind = { SENT: 'sent', QUEUED: 'queued', WAIT: 'wait', ERROR: 'error' } as const;

export type LogKind = (typeof LogKind)[keyof typeof LogKind];

/** Cihaz günlüğünün bir satırı. */
export interface DeviceLogEntry {
  id: number;
  at: Date;
  kind: LogKind;
  text: string;
  requestId?: string | null;
}

/** Gönderim kuyruğunun sunucu yanıtlarına göre çağırdıkları. */
export interface OutboxHandlers {
  /** 401: sürücü oturumu düştü (süresi doldu ya da çıkış yapıldı). */
  onUnauthorized?: () => void;
  /** 403/409: konum kiralama yüzünden reddedildi; kiralama hâlâ bu sürücüde mi bakılmalı. */
  onRentalRejected?: () => void;
}
