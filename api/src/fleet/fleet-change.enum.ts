/** Filo duyurusunun türü (bkz. FleetEvents, fleetChannel). */
export enum FleetChange {
  /** Scooter eklendi ya da silindi: API instance'ları kayıt listesini yeniler. */
  SCOOTERS = 'scooters',
  /** Kiralama başladı ya da bitti: istemciler scooter listesini yeniler. */
  RENTALS = 'rentals',
}
