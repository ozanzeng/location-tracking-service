/** Ekran akışı: giriş → scooter seçimi → sürüş → (sürüş bitince) scooter seçimi. */
export const Screen = {
  /** Saklı oturum doğrulanıyor, süren kiralama aranıyor. */
  CHECKING: 'checking',
  SIGNED_OUT: 'signed-out',
  PICKING: 'picking',
  RIDING: 'riding',
} as const;

export type Phase =
  | { kind: typeof Screen.CHECKING }
  | { kind: typeof Screen.SIGNED_OUT; notice: string | null }
  | { kind: typeof Screen.PICKING; notice: string | null }
  | { kind: typeof Screen.RIDING; scooterId: string };
