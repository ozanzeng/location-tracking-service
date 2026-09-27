/** Bir konumun işlenme sonucu; worker metriklerinde `result` etiketi olarak da kullanılır. */
export enum ProcessStatus {
  PROCESSED = 'processed',
  /** Kullanıcının son işlenen konumundan eski: durumu geriye götürmesin diye atlandı. */
  STALE = 'stale',
}
