/** ['*'] → tüm origin'ler, [] → kapalı, aksi halde sadece listedekiler. */
export function corsOrigin(origins: string[]): boolean | string[] {
  if (origins.includes('*')) return true;
  return origins.length ? origins : false;
}
