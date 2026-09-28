// Sürücü uygulamasında rota ve sürüklemenin yol ağıyla sınırlı olduğunu doğrular.
// Çalıştırma: npm run test:ui (clients klasöründe); sürücü uygulaması ayakta olmalı.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { newRider, registerScooter, signInAndRent, startRide } from './driverSession.mjs';

const CENTER = { lat: 40.984, lng: 29.035 };
const ZOOM = 15;

const SEA = { lat: 40.975, lng: 29.012 }; // Moda açıkları
// Seed'deki "Moda Sahil Parkı" (sürüş yasak)
const MODA_PARK = [
  { lat: 40.9828, lng: 29.0218 },
  { lat: 40.9842, lng: 29.0262 },
  { lat: 40.9808, lng: 29.0302 },
  { lat: 40.9785, lng: 29.0275 },
  { lat: 40.9798, lng: 29.0232 },
  { lat: 40.9828, lng: 29.0218 },
];
const MODA_PARK_CENTER = { lat: 40.9812, lng: 29.0262 };

function pointInZone(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng)
      inside = !inside;
  }
  return inside;
}
const STOPS = [
  { lat: 40.9868, lng: 29.0335 },
  { lat: 40.9835, lng: 29.0372 },
  { lat: 40.9777, lng: 29.0398 },
];

function project({ lat, lng }) {
  const scale = 256 * 2 ** ZOOM;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

let browser;
let page;
let toScreen;
let toLatLng;

before(async () => {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
  // Denizdeki test noktası haritanın sol kenarında; görünür kalması için geniş pencere.
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  // Harita girişten ve scooter seçiminden sonra açılır; sürükleme ve rota sürüşle.
  await signInAndRent(page, await newRider('roads'), await registerScooter('roads'));
  await startRide(page);
  const box = await page.locator('.map').boundingBox();
  toScreen = (point) => {
    const c = project(CENTER);
    const p = project(point);
    return { x: box.x + box.width / 2 + p.x - c.x, y: box.y + box.height / 2 + p.y - c.y };
  };
  toLatLng = ({ x, y }) => {
    const scale = 256 * 2 ** ZOOM;
    const c = project(CENTER);
    const px = c.x + x - (box.x + box.width / 2);
    const py = c.y + y - (box.y + box.height / 2);
    const n = Math.PI - (2 * Math.PI * py) / scale;
    return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (px / scale) * 360 - 180 };
  };
});

after(async () => {
  await browser?.close();
});

const cursorAt = async (point) => {
  const p = toScreen(point);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(150);
  return page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, p);
};
/** Rota önizlemesinin durumu: road (yolda), blocked (sürüş yasak bölgede), none. */
const previewAt = async (point) => {
  const p = toScreen(point);
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(200);
  return page.locator('.map').getAttribute('data-preview');
};
/** Rota varsa temizle (düğme boş rotada pasiftir). */
const clearRoute = async () => {
  const button = page.getByRole('button', { name: 'Rotayı temizle' });
  if ((await button.count()) && (await button.isEnabled())) await button.click();
};
const routeHint = async () => (await page.locator('.route .hint').first().textContent()).trim();

describe('rota ve sürükleme sadece yollarda', () => {
  test('rota çizerken yol yakınında artı, uzağında "izin yok" imleci', async () => {
    await page.getByRole('radio', { name: 'Rota çiz' }).click();
    assert.equal(await cursorAt(STOPS[0]), 'crosshair');
    assert.equal(await cursorAt(SEA), 'not-allowed');
  });

  test('yol olmayan yere tıklama durak eklemez', async () => {
    const sea = toScreen(SEA);
    await page.mouse.click(sea.x, sea.y);
    assert.match(await routeHint(), /yola tıklayarak durak ekleyin/);
  });

  test('arsaya yakın tıklamalar yola yapışır ve rota yolları takip eder', async () => {
    for (const stop of STOPS) {
      const p = toScreen(stop);
      await page.mouse.click(p.x, p.y);
    }
    const hint = await routeHint();
    const match = hint.match(/^3 durak, yol üzerinden ([\d.]+) km\./);
    assert.ok(match, hint);
    // Duraklar arası kuş uçuşu toplam ~1,2 km; yol üzerinden daha uzun olmalı.
    assert.ok(Number(match[1]) > 1.3, `rota ${match[1]} km`);
  });

  test('aynı arsaya tekrar tıklamak durağı siler ve rotayı yeniden hesaplar', async () => {
    const before = Number((await routeHint()).match(/([\d.]+) km/)[1]);
    const second = toScreen(STOPS[1]);
    // Aynı arsaya tekrar tıklamak aynı yol noktasına yapışır: ikinci durak silinir.
    await page.mouse.click(second.x, second.y);
    const hint = await routeHint();
    assert.match(hint, /^2 durak/);
    const after = Number(hint.match(/([\d.]+) km/)[1]);
    assert.notEqual(after, before, 'rota yeniden hesaplanmalı');
  });

  test('durağın üzerinde imleç değişir; durak noktasına tıklamak da siler', async () => {
    // Kalan son durağın ekrandaki yerini imleç "pointer" olana kadar ara.
    const target = toScreen(STOPS[2]);
    let onStop = null;
    for (let r = 0; r <= 60 && !onStop; r += 3) {
      for (const [dx, dy] of [
        [0, 0],
        [r, 0],
        [-r, 0],
        [0, r],
        [0, -r],
        [r, r],
        [-r, -r],
        [r, -r],
        [-r, r],
      ]) {
        await page.mouse.move(target.x + dx, target.y + dy);
        await page.waitForTimeout(40);
        const cursor = await page.evaluate(({ x, y }) => getComputedStyle(document.elementFromPoint(x, y)).cursor, {
          x: target.x + dx,
          y: target.y + dy,
        });
        if (cursor === 'pointer') {
          onStop = { x: target.x + dx, y: target.y + dy };
          break;
        }
      }
    }
    assert.ok(onStop, 'son durağın üzerinde imleç pointer olmalı');
    await page.mouse.click(onStop.x, onStop.y);
    assert.match(await routeHint(), /^1 durak/);
  });

  test('sürüş yasak bölgenin içine konan durak bölgenin sınırına iner', async () => {
    await clearRoute();
    assert.equal(await previewAt(MODA_PARK_CENTER), 'blocked', 'bölge içindeki önizleme kırmızı olmalı');
    assert.equal(await previewAt(STOPS[0]), 'road');
    const p = toScreen(MODA_PARK_CENTER);
    await page.mouse.click(p.x, p.y);
    await page.locator('.notice', { hasText: 'durak bölgenin sınırına kondu' }).waitFor();
    assert.match(await routeHint(), /^1 durak/);
  });

  test('sürüş yasak bölgeye sürüklenen scooter bölgeye girmez', async () => {
    await clearRoute();
    await page.getByRole('radio', { name: 'Sürükle' }).click();
    const marker = await page.locator('.leaflet-marker-icon.rider').boundingBox();
    const target = toScreen(MODA_PARK_CENTER);
    await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 40 });
    await page.mouse.up();
    const end = await page.locator('.leaflet-marker-icon.rider').boundingBox();
    const at = toLatLng({ x: end.x + end.width / 2, y: end.y + end.height / 2 });
    assert.ok(!pointInZone(at, MODA_PARK), `scooter parkın içinde kaldı: ${at.lat.toFixed(5)}, ${at.lng.toFixed(5)}`);
    await page.getByRole('radio', { name: 'Rota çiz' }).click();
  });

  test('denize sürüklenen scooter kıyıdaki yolda kalır', async () => {
    await clearRoute();
    await page.getByRole('radio', { name: 'Sürükle' }).click();
    const marker = await page.locator('.leaflet-marker-icon.rider').boundingBox();
    const sea = toScreen({ lat: 40.9745, lng: 29.0175 });
    await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
    await page.mouse.down();
    await page.mouse.move(sea.x, sea.y, { steps: 40 });
    await page.mouse.up();
    const end = await page.locator('.leaflet-marker-icon.rider').boundingBox();
    const distance = Math.hypot(end.x + end.width / 2 - sea.x, end.y + end.height / 2 - sea.y);
    assert.ok(distance > 20, `scooter denizdeki hedefe ${Math.round(distance)} px uzaklıkta`);
  });
});
