// Kadıköy yol ağını OpenStreetMap'ten (Overpass API) indirip sürücü uygulamasının
// yüklediği kompakt biçime çevirir: public/roads-kadikoy.json.
// Veri bir kez üretilip repoya konur; uygulama çalışırken dış servise bağımlı değildir.
//
// Kullanım: node scripts/fetch-roads.mjs            (Overpass'tan indirir)
//           node scripts/fetch-roads.mjs ham.json   (önceden indirilmiş Overpass JSON'unu çevirir)
//
// Veri © OpenStreetMap katkıcıları, ODbL lisansı.

import { readFile, writeFile } from 'node:fs/promises';

const BBOX = [40.95, 29.005, 41.012, 29.085]; // güney, batı, kuzey, doğu
// Scooter'ın gidebileceği yollar: taşıt yolları, yaya caddeleri, bisiklet ve park yolları.
// Merdivenler (steps) ve özel/kapalı yollar hariç.
const HIGHWAYS = [
  'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link',
  'unclassified', 'residential', 'living_street', 'service', 'pedestrian', 'cycleway',
  'footway', 'path', 'track',
];
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const OUT = new URL('../public/roads-kadikoy.json', import.meta.url);

const query = `[out:json][timeout:90];
way["highway"~"^(${HIGHWAYS.join('|')})$"]["access"!~"^(private|no)$"](${BBOX.join(',')});
(._;>;);out skel qt;`;

async function download() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const url of MIRRORS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'user-agent': 'geofence-case-study/1.0' },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(150_000),
        });
        const text = await res.text();
        if (res.ok && text.startsWith('{')) return JSON.parse(text);
        console.warn(`${url}: ${res.status}, sunucu meşgul olabilir`);
      } catch (err) {
        console.warn(`${url}: ${err.message}`);
      }
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
  throw new Error('Overpass sunucularının hiçbiri cevap vermedi; daha sonra tekrar deneyin.');
}

const raw = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : await download();

const coords = new Map();
for (const el of raw.elements) if (el.type === 'node') coords.set(el.id, [el.lat, el.lon]);

// Sadece yollarda kullanılan düğümler, 1e-6 derece (~11 cm) hassasiyetle tam sayı olarak.
const index = new Map();
const nodes = [];
const ways = [];
for (const el of raw.elements) {
  if (el.type !== 'way') continue;
  const way = [];
  for (const id of el.nodes) {
    const c = coords.get(id);
    if (!c) continue;
    if (!index.has(id)) {
      index.set(id, nodes.length / 2);
      nodes.push(Math.round(c[0] * 1e6), Math.round(c[1] * 1e6));
    }
    way.push(index.get(id));
  }
  if (way.length >= 2) ways.push(way);
}

const out = {
  attribution: '© OpenStreetMap katkıcıları (ODbL)',
  bbox: BBOX,
  generatedAt: new Date().toISOString().slice(0, 10),
  nodes,
  ways,
};
await writeFile(OUT, JSON.stringify(out));
console.log(`${nodes.length / 2} düğüm, ${ways.length} yol → ${OUT.pathname}`);
