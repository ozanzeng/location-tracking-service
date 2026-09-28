// Operasyon uygulamasında kayıtlı bir alanın şeklini haritada düzenleme.
// Çalıştırma: npm run test:ui (clients klasöründe); servis ve operasyon uygulaması ayakta olmalı.
// Test alanı "UI testi" önekli, denizde; test sonunda silinir (test-all.sh de temizler).

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { adminHeaders, OPS_URL, signInOps } from './driverSession.mjs';

const NAME = `UI testi şekil ${Date.now().toString(36)}`;
// Moda açıklarında, denizde.
const SQUARE = [
  [29.012, 40.974],
  [29.016, 40.974],
  [29.016, 40.977],
  [29.012, 40.977],
  [29.012, 40.974],
];

let browser;
let page;
let area;
let headers;
const errors = [];

before(async () => {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await signInOps(page);
  headers = await adminHeaders();
  const res = await page.request.post(`${OPS_URL}/api/areas`, {
    headers,
    data: { name: NAME, type: 'SLOW', geometry: { type: 'Polygon', coordinates: [SQUARE] } },
  });
  assert.equal(res.status(), 201);
  area = await res.json();
});

after(async () => {
  if (area) await page.request.delete(`${OPS_URL}/api/areas/${area.id}`, { headers });
  await browser?.close();
});

describe('alan şekli düzenleme', () => {
  test('köşe sürüklenince yeni şekil kaydedilir; ad ve tip korunur', { timeout: 20_000 }, async () => {
    await page.goto(`${OPS_URL}/#/areas`);
    await page.locator('.area-list li', { hasText: NAME }).getByRole('button', { name: 'Düzenle' }).click();
    const vertices = page.locator('.marker-icon:not(.marker-icon-middle)');
    await vertices.first().waitFor();
    await page.getByText('Şekil değişmedi.').waitFor();
    // Harita alana yakınlaşırken köşeler yer değiştirir; animasyon bitince tutulur.
    await page.waitForTimeout(800);

    const v = await vertices.nth(1).boundingBox();
    await page.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
    await page.mouse.down();
    await page.mouse.move(v.x + v.width / 2 + 60, v.y + v.height / 2 + 40, { steps: 10 });
    await page.mouse.up();
    await page.getByText(/Şekil değişti/).waitFor();

    await page.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await page.locator('.panel .hint', { hasText: 'güncellendi' }).waitFor();

    const saved = (await (await page.request.get(`${OPS_URL}/api/areas`, { headers })).json()).find(
      (a) => a.id === area.id,
    );
    assert.equal(saved.name, NAME);
    assert.equal(saved.type, 'SLOW');
    const [moved] = saved.geometry.coordinates[0].slice(1, 2);
    assert.notDeepEqual(moved, SQUARE[1]);
    // Diğer köşeler yerinde.
    assert.deepEqual(saved.geometry.coordinates[0][0], SQUARE[0]);
  });

  test('sayfada hata yok', () => {
    assert.deepEqual(errors, []);
  });
});
