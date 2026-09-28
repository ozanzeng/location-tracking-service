/** Kiralamanın neden bittiği (veritabanında rental_end_reason). */
export enum RentalEndReason {
  /** Sürücü "Sürüşü bitir" dedi. */
  RETURNED = 'RETURNED',
  /** Scooter SIGNAL_LOSS_TIMEOUT_MS boyunca konum göndermedi; worker kapattı. */
  SIGNAL_LOST = 'SIGNAL_LOST',
}
