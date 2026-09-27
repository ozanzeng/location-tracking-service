import { memo } from 'react';
import { Polygon, Tooltip } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { AreaType, type Area } from '../api/types';
import { ZONES } from '../zones/zoneStyles';

const toLatLngs = (area: Area): LatLngExpression[][] =>
  area.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]));

// Hizmet bölgesi en altta kalsın, küçük bölgeler üstte tıklanabilsin.
const byLayer = (a: Area, b: Area) => Number(b.type === AreaType.SERVICE) - Number(a.type === AreaType.SERVICE);

export const AreasLayer = memo(function AreasLayer({ areas }: { areas: Area[] }) {
  return (
    <>
      {areas.toSorted(byLayer).map((area) => {
        const zone = ZONES[area.type];
        return (
          <Polygon
            key={area.id}
            positions={toLatLngs(area)}
            interactive={area.type !== AreaType.SERVICE}
            pathOptions={{
              color: zone.color,
              weight: area.type === AreaType.SERVICE ? 2 : 1.5,
              fillColor: zone.fill,
              fillOpacity: zone.fillOpacity,
              dashArray: zone.dashArray,
            }}
          >
            {area.type !== AreaType.SERVICE ? (
              <Tooltip sticky>
                <strong>{area.name}</strong>
                <br />
                {zone.label}
              </Tooltip>
            ) : null}
          </Polygon>
        );
      })}
    </>
  );
});
