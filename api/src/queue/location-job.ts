export const LOCATION_QUEUE = 'locations';
export const LOCATION_JOB = 'location';

export interface LocationJobData {
  userId: string;
  lat: number;
  lng: number;
  /** Konumun cihazda ölçüldüğü an (ISO 8601). */
  recordedAt: string;
}
