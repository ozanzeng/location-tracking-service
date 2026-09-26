// Sürüşün sadece park alanlarında bitirilebildiğini doğrular.
// Çalıştırma: npm run test:ui (clients klasöründe); servis ve sürücü uygulaması ayakta, alanlar seed edilmiş olmalı.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';

const DRIVER_URL = process.env.DRIVER_URL ?? 'http://localhost:8081';
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

before(async () => {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(DRIVER_URL);
  await page.waitForFunction(() => document.querySelector('.panel')?.textContent.includes('yol üzerinde kalır'));
  await page.locator('#scooter-id').fill(`ui-ride-${Date.now().toString(36)}`);
});

after(async () => {
  await browser?.close();
});

describe('sürüşü bitirme', () => {
  test('sürüş yokken bağlantı düğmesi yok; sürüş başlayınca bağlantı açık', async () => {
    assert.equal(await page.getByRole('button', { name: 'Bağlantıyı kes' }).count(), 0);
    await page.getByText('Sürüş başlayınca bağlantı açılır.').waitFor();
  });

  test('park alanı dışında bitirilemez; en yakın park alanı söylenir', async () => {
    await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
    await page.getByText('Çevrimiçi', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sürüşü bitir' }).click();
    const alert = page.getByRole('alert');
    await alert.waitFor();
    const text = await alert.textContent();
    assert.match(text, /Sürüş sadece park alanlarında bitirilebilir/);
    assert.match(text, /En yakın park alanı: .+, yaklaşık \d+ m/);
    // Sürüş devam ediyor.
    assert.equal(await page.getByRole('button', { name: 'Sürüşü bitir' }).count(), 1);
  });

  test('park alanına gelince sürüş biter', async () => {
    const box = await page.locator('.map').boundingBox();
    const c = project(CENTER);
    const p = project(MODA_CADDESI_PARKING);
    const target = { x: box.x + box.width / 2 + p.x - c.x, y: box.y + box.height / 2 + p.y - c.y };
    const marker = await page.locator('.leaflet-marker-icon.rider').boundingBox();
    await page.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 25 });
    await page.mouse.up();

    // Hareket edince eski uyarı kalkar.
    await page.getByRole('alert').waitFor({ state: 'detached', timeout: 2000 });
    await page.getByRole('button', { name: 'Sürüşü bitir' }).click();
    await page.getByRole('button', { name: 'Sürüşü başlat' }).waitFor({ timeout: 2000 });
    assert.equal(await page.getByRole('alert').count(), 0);
  });

  test(
    'çevrimdışı bitirilen sürüşten sonra yeni sürüş bağlantıyı açar ve birikenleri gönderir',
    { timeout: 30_000 },
    async () => {
      await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
      await page.getByRole('button', { name: 'Bağlantıyı kes' }).click();
      await page.locator('.device-log__item--queued').first().waitFor({ timeout: 8000 });
      await page.getByRole('button', { name: 'Sürüşü bitir' }).click(); // hâlâ park alanında
      await page.getByRole('button', { name: 'Sürüşü başlat' }).waitFor();

      await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
      await page.getByText('Çevrimiçi', { exact: true }).waitFor();
      await page
        .locator('.device-log__item--sent', { hasText: /Biriken \d+ konum toplu gönderildi|Konum gönderildi/ })
        .first()
        .waitFor({ timeout: 8000 });
      await page.getByText(/konum gönderilmeyi bekliyor/).waitFor({ state: 'detached', timeout: 8000 });
    },
  );
});
