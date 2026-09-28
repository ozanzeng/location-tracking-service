// Tarayıcı testleri için sürücü hesabı ve scooter: sürücü uygulaması girişten ve scooter
// seçiminden sonra haritayı açar. Test verisi "ui-" önekli; test-all.sh sonda temizler.

export const DRIVER_URL = process.env.DRIVER_URL ?? 'http://localhost:8081';
export const OPS_URL = process.env.OPS_URL ?? 'http://localhost:8080';

const run = Date.now().toString(36);

async function call(url, body, expected) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!expected.includes(res.status)) {
    throw new Error(`${url} → ${res.status} ${await res.text()}`);
  }
  return res;
}

/** Filoya test scooter'ı ekler (operasyon uygulamasının nginx'i anahtarı ekler). */
export async function registerScooter(name) {
  const id = `ui-${name}-${run}`;
  // 409: aynı koşuda daha önce eklendi.
  await call(`${OPS_URL}/api/scooters`, { id, name: `UI testi ${name}` }, [201, 409]);
  return id;
}

/** Yeni sürücü hesabı (API ile); giriş arayüzden yapılır. */
export async function newRider(name) {
  const rider = { username: `ui-${name}-${run}`, password: `ui-sifre-${run}` };
  await call(`${DRIVER_URL}/api/auth/register`, rider, [201]);
  return rider;
}

/** Sürücü uygulamasında giriş yapar ve scooter'ı seçer; harita ve yol ağı yüklenene kadar bekler. */
export async function signInAndRent(page, rider, scooterId) {
  await page.goto(DRIVER_URL);
  await page.getByLabel('Kullanıcı adı').fill(rider.username);
  await page.getByLabel('Şifre').fill(rider.password);
  await page.locator('form').getByRole('button', { name: 'Giriş yap' }).click();
  await pickScooter(page, scooterId);
}

/** Seçim ekranında scooter'ı seçer ve sürüş ekranını bekler. */
export async function pickScooter(page, scooterId) {
  await page.getByRole('button', { name: new RegExp(`${scooterId}.*Boşta`) }).click();
  await page.waitForSelector('.leaflet-marker-icon.rider');
  await page.getByRole('button', { name: 'Sürüşü başlat' }).waitFor();
}

/**
 * Sürüşü başlatır: uygulama çevrimiçi olur, hareket paneli açılır. Yol ağı yüklenene kadar
 * beklenir (sürükleme ve rota yola yapışır).
 */
export async function startRide(page) {
  await page.getByRole('button', { name: 'Sürüşü başlat' }).click();
  await page.getByText('Çevrimiçi', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('.panel')?.textContent.includes('yol üzerinde kalır'));
}
