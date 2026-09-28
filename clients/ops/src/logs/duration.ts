/** Bir andan bu yana geçen süre, kaba biçimde ("40 sn önce", "5 dk önce", "2 sa önce", "3 gün önce"). */
export function formatAgo(from: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(from)) / 1000));
  if (seconds < 60) return `${seconds} sn önce`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.floor(hours / 24)} gün önce`;
}

/** Giriş ile çıkış arasındaki kalış süresi, okunur biçimde ("45 sn", "3 dk 12 sn", "1 sa 5 dk"). */
export function formatDuration(entry: string, exit: string): string {
  const seconds = Math.max(0, Math.round((Date.parse(exit) - Date.parse(entry)) / 1000));
  if (seconds < 60) return `${seconds} sn`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} dk ${seconds % 60} sn`;
  return `${Math.floor(minutes / 60)} sa ${minutes % 60} dk`;
}
