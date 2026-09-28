// POST /locations yük testi: çok sayıda scooter'dan konum.
// Çalıştırma: ./loadtest/run.sh  (veya docker compose --profile loadtest run --rm k6)
//
// Ortam değişkenleri:
//   PEAK_RPS      tepe hız (konum/sn), varsayılan 2000
//   SCOOTERS      scooter sayısı, varsayılan 5000
//   MOVE          route (varsayılan): her scooter kendi yolunda ~20 km/sa ilerler, scooter'lar
//                 sırayla gönderir (her biri SCOOTERS / hız saniyede bir).
//                 teleport: her istek rastgele bir scooter ve bölgede rastgele bir nokta; neredeyse
//                 her konum giriş/çıkış üretir (en kötü durum, README'deki eski ölçümler bununla).
//   PROFILE       load (varsayılan): 10 sn ısınma + tepe. soak: SOAK_RPS hızında SOAK_DURATION
//                 boyunca sabit yük (sızıntı, şişme, bağlantı tükenmesi için).
//   SOAK_RPS      varsayılan 500;  SOAK_DURATION  varsayılan 30m
import { check } from 'k6';
import exec from 'k6/execution';
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_KEY = __ENV.API_KEY || 'dev-api-key';
const PEAK_RPS = Number(__ENV.PEAK_RPS || 2000);
const SCOOTERS = Number(__ENV.SCOOTERS || 5000);
const MOVE = __ENV.MOVE || 'route';
const PROFILE = __ENV.PROFILE || 'load';
const SOAK_RPS = Number(__ENV.SOAK_RPS || 500);
const SOAK_DURATION = __ENV.SOAK_DURATION || '30m';

if (!['route', 'teleport'].includes(MOVE)) throw new Error(`MOVE route ya da teleport olmalı: ${MOVE}`);
if (!['load', 'soak'].includes(PROFILE)) throw new Error(`PROFILE load ya da soak olmalı: ${PROFILE}`);

/** Bir isteğin en fazla bekleyeceği süre; takılan istek VU'yu dakikalarca tutmasın. */
const REQUEST_TIMEOUT = '5s';

// Arrival-rate: gereken VU ≈ hız × yanıt süresi. Önceden 200 ms'lik pay ayrılır, gerekirse
// 1 sn'ye kadar büyür. VU yetmezse k6 isteği göndermez (dropped_iterations): koşu geçersiz sayılır.
const vus = (rps) => ({ preAllocatedVUs: Math.max(50, Math.ceil(rps / 5)), maxVUs: Math.max(100, rps) });

const SCENARIOS = {
  load: {
    // Isınma ayrı: bağlantı havuzları ve JIT ısınırken ölçülen gecikme eşiklere girmez.
    warmup: { executor: 'constant-arrival-rate', rate: 100, timeUnit: '1s', duration: '10s', ...vus(100) },
    peak: {
      executor: 'ramping-arrival-rate',
      startTime: '10s',
      startRate: 100,
      timeUnit: '1s',
      ...vus(PEAK_RPS),
      stages: [
        { duration: '15s', target: PEAK_RPS / 2 },
        { duration: '15s', target: PEAK_RPS },
        { duration: '30s', target: PEAK_RPS },
        { duration: '10s', target: 0 },
      ],
    },
  },
  soak: {
    soak: { executor: 'constant-arrival-rate', rate: SOAK_RPS, timeUnit: '1s', duration: SOAK_DURATION, ...vus(SOAK_RPS) },
  },
};
const MEASURED = PROFILE === 'load' ? 'peak' : 'soak';

export const options = {
  scenarios: SCENARIOS[PROFILE],
  // Kurulumda SCOOTERS kadar scooter kaydedilir (bkz. setup).
  setupTimeout: '120s',
  thresholds: {
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
    [`http_req_duration{scenario:${MEASURED}}`]: ['p(95)<150', 'p(99)<400'],
    // k6 hedef hızı üretemediyse (VU yetmedi) sonuçlar başka koşularla karşılaştırılamaz.
    dropped_iterations: ['count==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/** Kabul edilen (202) konum sayısı; run.sh worker hızını bununla hesaplar. */
const accepted = new Counter('accepted_locations');

// Kadıköy çevresi: noktaların bir kısmı tanımlı alanlara düşer ve giriş/çıkış üretir.
const BOUNDS = { minLat: 40.962, maxLat: 41.0, minLng: 29.015, maxLng: 29.07 };
const MID = { lat: (BOUNDS.minLat + BOUNDS.maxLat) / 2, lng: (BOUNDS.minLng + BOUNDS.maxLng) / 2 };
const HALF = { lat: (BOUNDS.maxLat - BOUNDS.minLat) / 2, lng: (BOUNDS.maxLng - BOUNDS.minLng) / 2 };
const rand = (min, max) => min + Math.random() * (max - min);

/**
 * Scooter i'nin t anındaki (sn) konumu: bölgeyi dolaşan kendine özgü bir eğri (Lissajous).
 * Konum saatten hesaplandığı için VU'lar arasında durum paylaşmak gerekmez; aynı scooter'ın
 * ardışık konumları birbirine yakındır. Açısal hızlar 0,0020-0,0030 rad/sn, bölgenin yarı
 * genişliği ~2 km: 5000 scooter için ölçülen hız ortalama 19, p95 28, en fazla 33 km/sa.
 */
function routePoint(i, t) {
  const a = 0.002 + ((i * 7919) % 1000) / 1e6;
  const b = 0.002 + ((i * 104729) % 1000) / 1e6;
  const phaseA = (i * 2.399) % (2 * Math.PI);
  const phaseB = (i * 1.618) % (2 * Math.PI);
  return {
    lat: MID.lat + HALF.lat * Math.sin(a * t + phaseA),
    lng: MID.lng + HALF.lng * Math.sin(b * t + phaseB),
  };
}

function nextLocation() {
  const now = new Date();
  if (MOVE === 'teleport') {
    return {
      userId: `load-${Math.floor(Math.random() * SCOOTERS)}`,
      lat: rand(BOUNDS.minLat, BOUNDS.maxLat),
      lng: rand(BOUNDS.minLng, BOUNDS.maxLng),
      timestamp: now.toISOString(),
    };
  }
  // Sırayla: her scooter eşit aralıkla gönderir, gerçek bir filodaki gibi.
  const i = exec.scenario.iterationInTest % SCOOTERS;
  return { userId: `load-${i}`, ...routePoint(i, now.getTime() / 1000), timestamp: now.toISOString() };
}

function post(location) {
  return http.post(`${BASE_URL}/locations`, JSON.stringify(location), {
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
    timeout: REQUEST_TIMEOUT,
    tags: { name: 'POST /locations' },
  });
}

/**
 * Sadece kayıtlı scooter'lar konum gönderebilir: yük başlamadan test filosu (load-0 …
 * load-N, load-setup) POST /scooters ile kaydedilir; zaten kayıtlıysa 409 da kabul. Sonra
 * tek bir konum: adres ya da anahtar yanlışsa binlerce hata yerine hemen durulur. Test verisi
 * run.sh'ta kuyruk boşalınca silinir.
 */
export function setup() {
  const ids = ['load-setup', ...Array.from({ length: SCOOTERS }, (_, i) => `load-${i}`)];
  const headers = { 'content-type': 'application/json', 'x-api-key': API_KEY };
  for (let from = 0; from < ids.length; from += 200) {
    const responses = http.batch(
      ids.slice(from, from + 200).map((id) => ({
        method: 'POST',
        url: `${BASE_URL}/scooters`,
        body: JSON.stringify({ id, name: `Yük testi ${id}` }),
        // 409 (önceki koşudan kayıtlı) hata sayılmasın: http_req_failed eşiğini bozardı.
        params: { headers, tags: { name: 'setup: POST /scooters' }, responseCallback: http.expectedStatuses(201, 409) },
      })),
    );
    const failed = responses.find((r) => r.status !== 201 && r.status !== 409);
    if (failed) {
      exec.test.abort(`Test filosu kaydedilemedi (${failed.status || failed.error}): BASE_URL ve API_KEY'i kontrol edin`);
    }
  }
  const res = post({ userId: 'load-setup', ...routePoint(0, Date.now() / 1000), timestamp: new Date().toISOString() });
  if (res.status !== 202) {
    exec.test.abort(`Servis konum kabul etmiyor (${res.status || res.error}): BASE_URL ve API_KEY'i kontrol edin`);
  }
}

export default function () {
  const res = post(nextLocation());
  const ok = check(res, { 'status 202': (r) => r.status === 202 });
  if (ok) accepted.add(1);
}
