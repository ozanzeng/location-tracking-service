import type { LocationJobData } from '../queue/location-job.js';

/** Cihaz saatinin sunucudan ileride olmasına izin verilen pay. */
export const MAX_CLOCK_SKEW_MS = 60_000;

export interface IncomingLocation {
  userId: string;
  lat: number;
  lng: number;
  timestamp: string;
}

/** İleri tarihli konum: sonraki gerçek konumların "eski" sayılıp atlanmasına yol açardı. */
export class FutureTimestampError extends Error {
  constructor(readonly index: number) {
    super('timestamp gelecekte olamaz');
  }
}

/**
 * Konumları doğrular ve kullanıcı başına, zamana göre sıralı işlere dönüştürür.
 * Bir istekteki noktalar tek işte sıralı durur; ayrı işler olsalardı paralel worker'lar
 * yeniyi eskiden önce işleyebilir ve eski nokta atlanıp alan girişi kaçabilirdi.
 * Doğrulama hepsi-ya-hiçbiri: bir konum geçersizse hiçbiri işe dönüşmez.
 */
export function buildLocationJobs(
  locations: IncomingLocation[],
  requestId: string | undefined,
  now: Date,
): LocationJobData[] {
  const byUser = new Map<string, LocationJobData>();
  locations.forEach((location, i) => {
    const recordedAt = new Date(location.timestamp);
    if (recordedAt.getTime() > now.getTime() + MAX_CLOCK_SKEW_MS) {
      throw new FutureTimestampError(i);
    }
    let job = byUser.get(location.userId);
    if (!job) {
      job = { userId: location.userId, points: [], requestId };
      byUser.set(location.userId, job);
    }
    job.points.push({
      lat: location.lat,
      lng: location.lng,
      recordedAt: recordedAt.toISOString(),
    });
  });
  const jobs = [...byUser.values()];
  for (const job of jobs) {
    job.points.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  }
  return jobs;
}
