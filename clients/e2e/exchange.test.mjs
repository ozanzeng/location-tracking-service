// Sürücü ve operasyon uygulamaları arasındaki veri alışverişinin tarayıcı testi.
// İki uygulama ve servis ayakta olmalı (docker compose up) ve alanlar seed edilmiş olmalı.
//
// Çalıştırma: npm run test:ui   (clients klasöründe)
// Ortam: DRIVER_URL (varsayılan http://localhost:8081), OPS_URL (http://localhost:8080),
//        PW_CHANNEL (varsayılan chrome; yüklü Google Chrome kullanılır)
//
// Not: Son senaryo gerçek bir alan oluşturur ("UI testi ..." adıyla, Moda açıklarında denizde).
// Paylaşılan ortamlarda değil, yerel/test ortamında çalıştırın.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { chromium } from 'playwright-core';
import { newRider, OPS_URL, registerScooter, signInAndRent, startRide } from './driverSession.mjs';

const GPS_WAIT = 12_000; // 5 sn örnekleme + kuyruk + canlı yayın payı

// Harita merkezi ve zoom'u BaseMap ile aynı; coğrafi noktayı ekran pikseline çevirmek için.
const CENTER = { lat: 40.984, lng: 29.035 };
const ZOOM = 15;
const ALTIYOL_NO_PARKING = { lat: 40.99, lng: 29.0301 }; // "Altıyol Kavşağı", park yasak

function project({ lat, lng }) {
  const scale = 256 * 2 ** ZOOM;
  const s = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale,
  };
}

async function toScreen(page, point) {
  const box = await page.locator('.map').boundingBox();
  const c = project(CENTER);
  const p = project(point);
  return { x: box.x + box.width / 2 + p.x - c.x, y: box.y + box.height / 2 + p.y - c.y };
}

let browser;
let driver;
let ops;
const errors = [];
let scooterId;

before(async () => {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  for (const name of ['driver', 'ops']) {
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && errors.push(`${name}: ${m.text()}`));
    if (name === 'driver') driver = page;
    else ops = page;
  }
  scooterId = await registerScooter('exchange');
  await ops.goto(`${OPS_URL}/#/live`);
  await ops.waitForSelector('.live:not(.live--off)');
  await signInAndRent(driver, await newRider('exchange'), scooterId);
});

after(async () => {
  await browser?.close();
});

describe('sürücü ↔ servis ↔ operasyon', () => {
  test('sürüş başlayınca konum gönderilir', { timeout: 20_000 }, async () => {
    await startRide(driver);
    await driver
      .locator('.device-log__item--sent', { hasText: 'Konum gönderildi' })
      .first()
      .waitFor({ timeout: GPS_WAIT });
  });

  test('park yasak bölgeye giriş: sürücüde levha, operasyonda olay ve kayıt', { timeout: 40_000 }, async () => {
    const marker = await driver.locator('.leaflet-marker-icon.rider').boundingBox();
    const target = await toScreen(driver, ALTIYOL_NO_PARKING);
    await driver.mouse.move(marker.x + marker.width / 2, marker.y + marker.height / 2);
    await driver.mouse.down();
    await driver.mouse.move(target.x, target.y, { steps: 20 });
    await driver.mouse.up();

    // Sürücü: sunucudan gelen bildirim levhası
    await driver.locator('.plate', { hasText: 'Park yasak' }).waitFor({ timeout: GPS_WAIT });

    // Operasyon: canlı akışta bu scooter'ın girişi
    await ops.locator('.feed__item', { hasText: `${scooterId} girdi: Altıyol Kavşağı` }).waitFor({ timeout: GPS_WAIT });

    // Operasyon: giriş kayıtları tablosunda, hâlâ içeride
    await ops.goto(`${OPS_URL}/#/logs`);
    // Üstteki filtre kayıtlı scooterları listeler.
    await ops.getByLabel('Scooter').selectOption(scooterId);
    await ops.getByRole('button', { name: 'Filtrele' }).click();
    const row = ops.locator('.logs tbody tr', { hasText: scooterId }).filter({ hasText: 'Altıyol Kavşağı' });
    await row.waitFor();
    assert.match(await row.textContent(), /İçeride/);
    // Filtre uygulandı: tablodaki her satır bu scooter'a ait.
    await ops.waitForFunction(
      (id) => [...document.querySelectorAll('.logs tbody tr')].every((tr) => tr.textContent.includes(id)),
      scooterId,
    );

    // Scooter'a tıklayınca sağda detay paneli: kimde, içinde bulunduğu alan ve cihaz günlüğü.
    await row.getByRole('button', { name: scooterId }).click();
    const drawer = ops.getByRole('complementary', { name: new RegExp(scooterId) });
    await drawer.getByText(/Kullanımda: ui-exchange-/).waitFor();
    await drawer.locator('.device-feed', { hasText: 'Girdi: Altıyol Kavşağı' }).waitFor();
    await ops.keyboard.press('Escape');
    await drawer.waitFor({ state: 'detached' });
  });

  test('park yasak bölgede sürüş bitirilemez', async () => {
    await driver.getByRole('button', { name: 'Sürüşü bitir' }).click();
    await driver.getByRole('alert').filter({ hasText: 'Park yasak bölgede sürüş bitirilemez' }).waitFor();
    // Sürüş devam ediyor.
    assert.equal(await driver.getByRole('button', { name: 'Sürüşü bitir' }).count(), 1);
  });

  test('çevrimdışıyken biriken konumlar bağlanınca toplu gider', { timeout: 40_000 }, async () => {
    await driver.getByRole('button', { name: 'Bağlantıyı kes' }).click();
    await driver.locator('.device-log__item--queued').nth(1).waitFor({ timeout: GPS_WAIT });
    const pending = await driver.locator('.field .hint', { hasText: 'gönderilmeyi bekliyor' }).textContent();
    assert.match(pending, /^[2-9]\d* konum gönderilmeyi bekliyor/);

    await driver.getByRole('button', { name: 'Bağlan' }).click();
    await driver
      .locator('.device-log__item--sent', { hasText: /Biriken \d+ konum toplu gönderildi/ })
      .waitFor({ timeout: 10_000 });
  });

  test('operasyonun çizdiği yeni alan sürücüye sayfa yenilenmeden ulaşır', { timeout: 30_000 }, async () => {
    await ops.goto(`${OPS_URL}/#/areas`);
    await ops.waitForSelector('.leaflet-pm-toolbar');
    // Moda açıklarında, denizde küçük bir dikdörtgen
    const a = await toScreen(ops, { lat: 40.9765, lng: 29.0165 });
    const b = await toScreen(ops, { lat: 40.9745, lng: 29.0195 });
    await ops.locator('.leaflet-pm-icon-rectangle').click();
    await ops.mouse.click(a.x, a.y);
    await ops.mouse.click(b.x, b.y);
    await ops.locator('#area-name').fill(`UI testi ${scooterId}`);

    // Sürücü, sunucunun "areas-changed" duyurusuyla alan listesini yeniden çeker.
    const refetch = driver.waitForRequest((r) => r.url().endsWith('/api/areas') && r.method() === 'GET', {
      timeout: 10_000,
    });
    await ops.getByRole('button', { name: 'Alanı kaydet' }).click();
    await ops.locator('.panel .hint', { hasText: 'kaydedildi' }).waitFor();
    await refetch;
  });

  test('operasyon alanı düzenleyip silince sürücü sayfa yenilenmeden güncellenir', { timeout: 30_000 }, async () => {
    const name = `UI testi ${scooterId}`;
    const renamed = `${name} (düzenlendi)`;
    const refetch = () =>
      driver.waitForRequest((r) => r.url().endsWith('/api/areas') && r.method() === 'GET', { timeout: 10_000 });

    // Düzenle: ad değişir, kaydedilir; liste ve sürücü güncellenir.
    await ops.locator('.area-list li', { hasText: name }).getByRole('button', { name: 'Düzenle' }).click();
    await ops.getByRole('heading', { name: 'Alanı düzenle' }).waitFor();
    await ops.locator('#area-name').fill(renamed);
    let driverRefetched = refetch();
    await ops.getByRole('button', { name: 'Değişiklikleri kaydet' }).click();
    await ops.locator('.panel .hint', { hasText: 'güncellendi' }).waitFor();
    await ops.locator('.area-list li', { hasText: renamed }).waitFor();
    await driverRefetched;

    // Sil: sayfa içi onay, liste ve sürücü güncellenir.
    const row = ops.locator('.area-list li', { hasText: renamed });
    await row.getByRole('button', { name: 'Sil' }).click();
    driverRefetched = refetch();
    await row.getByRole('button', { name: 'Evet, sil' }).click();
    await ops.locator('.panel .hint', { hasText: 'silindi' }).waitFor();
    await ops.locator('.area-list li', { hasText: renamed }).waitFor({ state: 'detached' });
    await driverRefetched;
  });

  test('operasyonun filo ekranında scooter bu sürücüde görünür', async () => {
    await ops.goto(`${OPS_URL}/#/scooters`);
    const row = ops.locator('.logs tbody tr', { hasText: scooterId });
    await row.waitFor();
    assert.match(await row.textContent(), /Kullanımda: ui-exchange-/);
    // Kullanımdaki scooter silinemez.
    assert.equal(await row.getByRole('button', { name: 'Sil' }).isDisabled(), true);
  });

  test('iki uygulamada da konsol hatası yok', () => {
    assert.deepEqual(errors, []);
  });
});
