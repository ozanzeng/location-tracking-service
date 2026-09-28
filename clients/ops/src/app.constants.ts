/** Üst çubuktaki ekranlar, sırasıyla. */
export const ROUTES = [
  { hash: '#/live', label: 'Canlı izleme' },
  { hash: '#/logs', label: 'Giriş kayıtları' },
  { hash: '#/areas', label: 'Alanlar' },
  { hash: '#/scooters', label: 'Scooterlar' },
] as const;

/** Oturum düşünce giriş ekranında gösterilen not. */
export const EXPIRED_NOTICE = 'Oturumun süresi doldu, tekrar giriş yapın.';
