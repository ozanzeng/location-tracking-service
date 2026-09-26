/** Giriş ile çıkış arasındaki kalış süresi, okunur biçimde ("45 sn", "3 dk 12 sn", "1 sa 5 dk"). */
export function formatDuration(entry: string, exit: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(exit) - Date.parse(entry)) / 1000));
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk ${seconds % 60} sn`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}
