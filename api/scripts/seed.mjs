// Kadıköy/Moda çevresinde örnek scooter bölgeleri oluşturur (POST /areas üzerinden).
// Kullanım: API_URL=http://localhost:3000 npm run seed
const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/** [minLng, minLat, maxLng, maxLat] → kapalı dikdörtgen halka */
const box = (minLng, minLat, maxLng, maxLat) => ({
  type: 'Polygon',
  coordinates: [
    [
      [minLng, minLat],
      [maxLng, minLat],
      [maxLng, maxLat],
      [minLng, maxLat],
      [minLng, minLat],
    ],
  ],
});

const polygon = (points) => ({
  type: 'Polygon',
  coordinates: [[...points, points[0]]],
});

const AREAS = [
  {
    name: 'Kadıköy Hizmet Bölgesi',
    type: 'SERVICE',
    geometry: polygon([
      [29.0145, 40.9935],
      [29.0335, 41.0045],
      [29.0735, 40.9905],
      [29.0735, 40.9585],
      [29.0325, 40.9635],
      [29.0195, 40.9765],
    ]),
  },
  {
    name: 'Kadıköy İskele Meydanı',
    type: 'NO_RIDE',
    geometry: box(29.0218, 40.9905, 29.0262, 40.9935),
  },
  {
    name: 'Moda Sahil Parkı',
    type: 'NO_RIDE',
    geometry: polygon([
      [29.0218, 40.9828],
      [29.0262, 40.9842],
      [29.0302, 40.9808],
      [29.0275, 40.9785],
      [29.0232, 40.9798],
    ]),
  },
  {
    name: 'Fenerbahçe Parkı',
    type: 'NO_RIDE',
    geometry: box(29.0335, 40.9665, 29.0415, 40.9715),
  },
  {
    name: 'Bahariye Caddesi',
    type: 'SLOW',
    geometry: polygon([
      [29.0268, 40.9892],
      [29.0282, 40.9898],
      [29.0335, 40.9838],
      [29.0321, 40.9831],
    ]),
  },
  {
    name: 'Bağdat Caddesi (Caddebostan)',
    type: 'SLOW',
    geometry: polygon([
      [29.0505, 40.9705],
      [29.0525, 40.9718],
      [29.0705, 40.9632],
      [29.0688, 40.9618],
    ]),
  },
  {
    name: 'Altıyol Kavşağı',
    type: 'NO_PARKING',
    geometry: box(29.0285, 40.9888, 29.0318, 40.9912),
  },
  {
    name: 'Yoğurtçu Parkı Park Alanı',
    type: 'PARKING',
    geometry: box(29.0352, 40.9842, 29.0372, 40.9856),
  },
  {
    name: 'Kalamış Marina Park Alanı',
    type: 'PARKING',
    geometry: box(29.0385, 40.9762, 29.0408, 40.9778),
  },
  {
    name: 'Moda Caddesi Park Alanı',
    type: 'PARKING',
    geometry: box(29.0262, 40.9858, 29.0278, 40.9868),
  },
];

const existing = await fetch(`${API_URL}/areas`).then((r) => {
  if (!r.ok) throw new Error(`GET /areas → ${r.status}`);
  return r.json();
});
const names = new Set(existing.map((a) => a.name));

let created = 0;
for (const area of AREAS) {
  if (names.has(area.name)) continue;
  const res = await fetch(`${API_URL}/areas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(area),
  });
  if (!res.ok) {
    throw new Error(`${area.name}: ${res.status} ${await res.text()}`);
  }
  created++;
}
console.log(`${created} alan oluşturuldu, ${AREAS.length - created} zaten vardı.`);
