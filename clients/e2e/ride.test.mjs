// Sürüşün sadece park alanlarında bitirilebildiğini doğrular.
// Çalıştırma: npm run test:ui (clients klasöründe); servis ve sürücü uygulaması ayakta, alanlar seed edilmiş olmalı.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { newRider, pickScooter, registerScooter, signInAndRent, startRide } from './driverSession.mjs';

const CENTER = { lat: 40.984, lng: 29.035 };
const ZOOM = 15;
const MODA_CADDESI_PARKING = { lat: 40.9863, lng: 29.027 }; // "Moda Caddesi Park Alanı"

function project({ lat, lng }) {
  const scale = 256 * 2 ** ZOOM;
  const s = Math.sin((lat * Math.PI) / 180);
  return { x: ((lng + 180) / 360) * scale, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale };
}

let browser;
let page;
let scooterId;

/** Scooter'ı haritada park alanına sürükler. */
async function dragToParking() {
  const box = await page.locator('.map').boundingBox();
  const c = project(CENTER);
  const p = project(MODA_CADDESI_PARKING);
  const target = { x: box.x + box.width / 2 + p.x - c.x, y: box.y + box.height / 2 + p.y - c.y };
  const marker = await page.locator('.leaflet-marker-icon.rider').boundingBox();
  await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 25 });
  await page.mouse.up();
}

before(async () => {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  scooterId = await registerScooter('ride');
  await signInAndRent(page, await newRider('ride'), scooterId);
});

after(async () => {
  await browser?.close();
});

describe('sürüşü bitirme', () => {
  test('sürüş başlamadan scooter hareket etmez: sürükleme, rota ve bağlantı bölümü yok', async () => {
    assert.equal(await page.getByRole('radio', { name: 'Rota çiz' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Bağlantıyı kes' }).count(), 0);
    // Leaflet sürüklenebilir işaretçiye bu sınıfı ekler.
    assert.equal(await page.locator('.leaflet-marker-icon.rider.leaflet-marker-draggable').count(), 0);
  });

  test('sürüş başlayınca uygulama kendiliğinden çevrimiçi, hareket paneli açılır', async () => {
    await startRide(page);
    await page.getByRole('radio', { name: 'Rota çiz' }).waitFor();
    await page.getByRole('button', { name: 'Bağlantıyı kes' }).waitFor();
    await page.locator('.leaflet-marker-icon.rider.leaflet-marker-draggable').waitFor();
  });

  test('park alanı dışında bitirilemez; en yakın park alanı söylenir', async () => {
    await page.getByRole('button', { name: 'Sürüşü bitir' }).click();
    const alert = page.getByRole('alert');
    await alert.waitFor();
    const text = await alert.textContent();
    assert.match(text, /Sürüş sadece park alanlarında bitirilebilir/);
    assert.match(text, /En yakın park alanı: .+, yaklaşık \d+ m/);
    // Sürüş devam ediyor.
    assert.equal(await page.getByRole('button', { name: 'Sürüşü bitir' }).count(), 1);
  });

  test('park alanına gelince sürüş biter ve scooter bırakılır', async () => {
    await dragToParking();

    // Hareket edince eski uyarı kalkar.
    await page.getByRole('alert').waitFor({ state: 'detached', timeout: 2000 });
    await page.getByRole('button', { name: 'Sürüşü bitir' }).click();
    // Scooter sunucuda bırakıldı, seçim ekranına dönüldü ve scooter tekrar boşta.
    await page.getByText(`${scooterId} bırakıldı.`).waitFor({ timeout: 5000 });
    await page.getByRole('button', { name: new RegExp(`${scooterId}.*Boşta`) }).waitFor();
  });

  test('çevrimdışı biriken konumlar scooter bırakılmadan önce gönderilir', { timeout: 30_000 }, async () => {
    // Scooter yeniden seçilince ekran başlangıç noktasından açılır; park alanına götürülür.
    await pickScooter(page, scooterId);
    await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
    await dragToParking();
    await page.getByRole('button', { name: 'Bağlantıyı kes' }).click();
    await page.locator('.device-log__item--queued').first().waitFor({ timeout: 8000 });

    // İstek sırası: önce biriken konumlar, sonra kiralamanın bitişi.
    const order = [];
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname;
      if (r.method() === 'POST' && /\/api\/(locations|rentals\/current\/end)/.test(path)) order.push(path);
    });
    await page.getByRole('button', { name: 'Sürüşü bitir' }).click();
    await page.getByText(`${scooterId} bırakıldı.`).waitFor({ timeout: 10_000 });
    assert.ok(order.length >= 2, `istekler: ${order.join(', ')}`);
    assert.match(order[0], /\/api\/locations/);
    assert.equal(order.at(-1), '/api/rentals/current/end');
  });
});
