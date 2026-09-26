// Demo filosu: Kadıköy'de rastgele dolaşan N scooter, her biri gerçek cihaz gibi
// 5 saniyede bir kendi konumunu gönderir. Operasyon ekranını doldurmak içindir;
// yük testi için loadtest/run.sh (k6) kullanılır.
//
// Kullanım: node loadtest/fleet.mjs [adet]   (varsayılan 50, Ctrl+C ile durur)
// Ortam: API_URL (varsayılan http://localhost:3000), API_KEY (varsayılan dev-api-key)

const API_URL = (process.env.API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.API_KEY ?? 'dev-api-key';
const COUNT = Math.max(1, Math.min(1000, Number(process.argv[2] ?? 50)));
const INTERVAL_MS = 5000;

/** Kadıköy hizmet bölgesinin kabaca içi. */
const BOUNDS = { minLat: 40.964, maxLat: 40.998, minLng: 29.02, maxLng: 29.068 };
const random = (min, max) => min + Math.random() * (max - min);
const rad = (deg) => (deg * Math.PI) / 180;

function move(from, headingDeg, meters) {
  return {
    lat: from.lat + (meters * Math.cos(rad(headingDeg))) / 111_320,
    lng: from.lng + (meters * Math.sin(rad(headingDeg))) / (111_320 * Math.cos(rad(from.lat))),
  };
}

const outOfBounds = (p) =>
  p.lat < BOUNDS.minLat || p.lat > BOUNDS.maxLat || p.lng < BOUNDS.minLng || p.lng > BOUNDS.maxLng;

const fleet = Array.from({ length: COUNT }, (_, i) => ({
  id: `fleet-${String(i + 1).padStart(3, '0')}`,
  lat: random(BOUNDS.minLat, BOUNDS.maxLat),
  lng: random(BOUNDS.minLng, BOUNDS.maxLng),
  heading: random(0, 360),
  speed: random(3, 7), // m/sn
  // Cihazlar aynı anda değil, 5 sn içine yayılarak gönderir.
  offset: Math.random() * INTERVAL_MS,
}));

function step(s) {
  s.heading = (s.heading + random(-25, 25) + 360) % 360;
  let next = move(s, s.heading, (s.speed * INTERVAL_MS) / 1000);
  if (outOfBounds(next)) {
    s.heading = (s.heading + 180) % 360;
    next = move(s, s.heading, (s.speed * INTERVAL_MS) / 1000);
  }
  Object.assign(s, next);
}

const stats = { sent: 0, failed: 0, lastError: '' };

async function send(s) {
  try {
    const res = await fetch(`${API_URL}/locations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({ userId: s.id, lat: s.lat, lng: s.lng, timestamp: new Date().toISOString() }),
    });
    if (res.ok) stats.sent++;
    else {
      stats.failed++;
      stats.lastError = `${res.status} ${await res.text()}`;
    }
  } catch (err) {
    stats.failed++;
    stats.lastError = err.message;
  }
}

const timers = fleet.map((s) =>
  setTimeout(() => {
    void send(s);
    s.timer = setInterval(() => {
      step(s);
      void send(s);
    }, INTERVAL_MS);
  }, s.offset),
);

const report = setInterval(() => {
  process.stdout.write(
    `\r${COUNT} scooter: ${stats.sent} konum gönderildi, ${stats.failed} başarısız${stats.lastError ? ` (son hata: ${stats.lastError.slice(0, 80)})` : ''}   `,
  );
}, 1000);

process.on('SIGINT', () => {
  timers.forEach(clearTimeout);
  fleet.forEach((s) => clearInterval(s.timer));
  clearInterval(report);
  console.log('\nFilo durduruldu.');
  process.exit(0);
});

console.log(`${COUNT} scooter ${API_URL} adresine 5 sn'de bir konum gönderiyor. Durdurmak için Ctrl+C.`);
