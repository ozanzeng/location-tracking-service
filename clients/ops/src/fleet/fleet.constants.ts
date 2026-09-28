import { RentalEndReason } from '@shared/api/types';

/** Kiralama bitiş sebeplerinin ekrandaki karşılıkları. */
export const END_REASONS: Record<RentalEndReason, string> = {
  [RentalEndReason.RETURNED]: 'bıraktı',
  [RentalEndReason.SIGNAL_LOST]: 'sinyal kaybı',
};
