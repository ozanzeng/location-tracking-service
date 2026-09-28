/** Sürüşün nasıl bittiği: sürücü bıraktı ya da sunucu sinyal kaybıyla bitirdi. */
export const RideEnd = { RETURNED: 'returned', LOST: 'lost' } as const;

export type RideEnd = (typeof RideEnd)[keyof typeof RideEnd];
