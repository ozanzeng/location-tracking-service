/** Sinyal kaybında kapatılan şey; `signal_loss_total` metriğinin `kind` etiketi. */
export enum SignalLossKind {
  /** Açık giriş kaydı. */
  VISIT = 'visit',
  /** Aktif kiralama. */
  RENTAL = 'rental',
}
