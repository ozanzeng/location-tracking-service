/**
 * Scooter operasyonundaki bölge tipleri (Martı benzeri).
 */
export enum AreaType {
  /** Sürüş yasak: scooter girerse durdurulur. */
  NO_RIDE = 'NO_RIDE',
  /** Hız sınırlı bölge. */
  SLOW = 'SLOW',
  /** Park etmek yasak. */
  NO_PARKING = 'NO_PARKING',
  /** Önerilen park alanı. */
  PARKING = 'PARKING',
  /** Hizmet verilen bölge sınırı. */
  SERVICE = 'SERVICE',
}
