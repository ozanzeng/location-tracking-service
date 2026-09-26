// İstemci smoke testi: sürücü ve operasyon uygulamaları ayakta mı, HİÇBİR VERİ YAZMADAN kontrol eder.
// Kullanım: npm run smoke   (DRIVER_URL, OPS_URL; varsayılan :8081 ve :8080)
// Tarayıcı adımları yüklü Google Chrome'u kullanır (PW_CHANNEL ile değiştirilebilir).
// Herhangi bir adım başarısız olursa 1 koduyla çıkar.

import { chromium } from 'playwright-core';

const DRIVER_URL = (process.env.DRIVER_URL ?? 'http://localhost:8081').replace(/\/$/, '');
const OPS_URL = (process.env.OPS_URL ?? 'http://localhost:8080').replace(/\/$/, '');
let failures = 0;

async function step(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    console.log(`  ✓ ${name} (${Date.now() - t} ms)${note ? ` ${note}` : ''}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n      ${err.message.split('\n')[0]}`);
  }
}
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const get = (url, headers = {}) => fetch(url, { headers, signal: AbortSignal.timeout(5000) });

/** Sayfayı ve referans verdiği JS/CSS dosyalarını indirir. */
async function checkApp(base) {
  const res = await get(`${base}/`);
  expect(res.ok, `${base}/ → ${res.status}`);
  const html = await res.text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
  expect(assets.length > 0, 'index.html içinde derlenmiş dosya yok');
  for (const asset of assets) {
    const r = await get(`${base}${asset}`);
    expect(r.ok, `${asset} → ${r.status}`);
  }
  return `${assets.length} dosya`;
}

console.log(`İstemci smoke testi: sürücü ${DRIVER_URL}, operasyon ${OPS_URL}\n`);

await step('sürücü uygulaması ve dosyaları', () => checkApp(DRIVER_URL));
await step('operasyon uygulaması ve dosyaları', () => checkApp(OPS_URL));

await step('yol haritası sıkıştırılmış geliyor', async () => {
  const res = await get(`${DRIVER_URL}/roads-kadikoy.json`, { 'accept-encoding': 'gzip' });
  expect(res.ok, `→ ${res.status}`);
  expect(res.headers.get('content-encoding') === 'gzip', 'gzip değil');
  const data = await res.json();
  expect(data.nodes?.length > 0 && data.ways?.length > 0, 'yol verisi boş');
  return `${data.nodes.length / 2} düğüm`;
});

for (const [name, base] of [
  ['sürücü', DRIVER_URL],
  ['operasyon', OPS_URL],
]) {
  await step(`${name}: nginx API'ye anahtarı ekliyor`, async () => {
    const health = await get(`${base}/api/health`);
    expect(health.ok, `/api/health → ${health.status}`);
    // /areas anahtar ister; tarayıcı anahtar göndermez, nginx eklemeli.
    const areas = await get(`${base}/api/areas`);
    expect(areas.ok, `/api/areas → ${areas.status} (nginx anahtarı eklemiyor olabilir)`);
    return `${(await areas.json()).length} alan`;
  });
}

let browser;
try {
  browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: true });
} catch (err) {
  failures++;
  console.log(`  ✗ tarayıcı başlatılamadı\n      ${err.message.split('\n')[0]}`);
}

if (browser) {
  const openPage = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    return { page, errors };
  };

  await step('sürücü: harita, scooter ve yol ağı yükleniyor', async () => {
    const { page, errors } = await openPage();
    await page.goto(DRIVER_URL);
    await page.waitForSelector('.leaflet-marker-icon.rider', { timeout: 8000 });
    await page.waitForFunction(() => document.querySelector('.panel')?.textContent.includes('yol üzerinde kalır'), null, {
      timeout: 8000,
    });
    await page.getByRole('button', { name: 'Yakınlaştır' }).waitFor({ timeout: 3000 });
    await page.getByRole('button', { name: 'Sürüşü başlat' }).waitFor({ timeout: 3000 });
    expect(errors.length === 0, `konsol hatası: ${errors[0]}`);
    await page.close();
  });

  await step('operasyon: canlı bağlantı, sistem durumu ve kayıtlar', async () => {
    const { page, errors } = await openPage();
    await page.goto(`${OPS_URL}/#/live`);
    await page.getByText('Canlı bağlantı açık').waitFor({ timeout: 8000 });
    await page.getByText(/Servis çalışıyor/).waitFor({ timeout: 8000 });
    await page.goto(`${OPS_URL}/#/logs`);
    await page.locator('table.logs').waitFor({ timeout: 5000 });
    expect(errors.length === 0, `konsol hatası: ${errors[0]}`);
    await page.close();
  });

  await browser.close();
}

console.log(failures ? `\n${failures} adım BAŞARISIZ` : '\nTüm adımlar geçti');
process.exit(failures ? 1 : 0);
