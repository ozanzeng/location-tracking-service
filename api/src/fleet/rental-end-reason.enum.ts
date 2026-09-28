/** Kiralamanın neden bittiği (veritabanında rental_end_reason). */
export enum RentalEndReason {
  /** Sürücü "Sürüşü bitir" dedi. */
  RETURNED = 'RETURNED',
  /** Scooter RENTAL_IDLE_TIMEOUT_MS boyunca konum göndermedi; worker bitirdi (IdleRentalSweeper). */
  SIGNAL_LOST = 'SIGNAL_LOST',
}
