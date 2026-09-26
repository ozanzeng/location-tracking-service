// POST /locations yük testi: çok sayıda scooter'dan artan hızda konum.
// Çalıştırma: ./loadtest/run.sh  (veya docker compose --profile loadtest run --rm k6)
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PEAK_RPS = Number(__ENV.PEAK_RPS || 2000);
const SCOOTERS = Number(__ENV.SCOOTERS || 5000);
const API_KEY = __ENV.API_KEY || 'dev-api-key';

export const options = {
  scenarios: {
    locations: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
      stages: [
        { duration: '15s', target: PEAK_RPS / 2 },
        { duration: '15s', target: PEAK_RPS },
        { duration: '30s', target: PEAK_RPS },
        { duration: '10s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<150', 'p(99)<400'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

// Kadıköy çevresi: noktaların bir kısmı tanımlı alanlara düşer ve giriş/çıkış üretir.
const BOUNDS = { minLat: 40.962, maxLat: 41.0, minLng: 29.015, maxLng: 29.07 };
const rand = (min, max) => min + Math.random() * (max - min);

export default function () {
  const userId = `load-${Math.floor(Math.random() * SCOOTERS)}`;
  const body = JSON.stringify({
    userId,
    lat: rand(BOUNDS.minLat, BOUNDS.maxLat),
    lng: rand(BOUNDS.minLng, BOUNDS.maxLng),
    timestamp: new Date().toISOString(),
  });
  const res = http.post(`${BASE_URL}/locations`, body, {
    headers: { 'content-type': 'application/json', 'x-api-key': API_KEY },
  });
  check(res, { 'status 202': (r) => r.status === 202 });
}
