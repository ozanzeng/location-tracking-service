import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const MAX_VERTICES = 10_000;

const isPosition = (p: unknown): p is [number, number] =>
  Array.isArray(p) &&
  p.length >= 2 &&
  typeof p[0] === 'number' &&
  typeof p[1] === 'number' &&
  Number.isFinite(p[0]) &&
  Number.isFinite(p[1]) &&
  p[0] >= -180 &&
  p[0] <= 180 &&
  p[1] >= -90 &&
  p[1] <= 90;

/**
 * GeoJSON Polygon yapısını doğrular ve hatayı açıklar; geçerliyse null döner.
 * Geometrik geçerlilik (kendini kesme vb.) ayrıca PostGIS ST_IsValid ile kontrol edilir.
 */
export function polygonError(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return 'geometry bir GeoJSON nesnesi olmalı';
  }
  const geo = value as { type?: unknown; coordinates?: unknown };
  if (geo.type !== 'Polygon') {
    return 'geometry.type "Polygon" olmalı';
  }
  if (!Array.isArray(geo.coordinates) || geo.coordinates.length === 0) {
    return 'geometry.coordinates en az bir halka içermeli';
  }
  let vertices = 0;
  for (const [i, ring] of geo.coordinates.entries()) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return `halka ${i} en az 4 nokta içermeli (ilk ve son nokta aynı)`;
    }
    if (!ring.every(isPosition)) {
      return `halka ${i} geçersiz koordinat içeriyor ([boylam, enlem] ve sınırlar içinde olmalı)`;
    }
    const first = ring[0] as number[];
    const last = ring[ring.length - 1] as number[];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return `halka ${i} kapalı değil: ilk ve son nokta aynı olmalı`;
    }
    vertices += ring.length;
  }
  if (vertices > MAX_VERTICES) {
    return `poligon en fazla ${MAX_VERTICES} nokta içerebilir`;
  }
  return null;
}

export function IsGeoJsonPolygon(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isGeoJsonPolygon',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => polygonError(value) === null,
        defaultMessage: (args: ValidationArguments) =>
          polygonError(args.value) ?? 'geçersiz GeoJSON Polygon',
      },
    });
  };
}
