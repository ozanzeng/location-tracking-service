// Ayakta olan bir ortama (yerel, staging, prod) karşı uçtan uca smoke testi.
// Kullanım: BASE_URL=http://localhost:3000 API_KEY=dev-api-key npm run smoke
//
// Tek bir sabit test alanı ("smoke-test-area", Güney Okyanusu'nda; gerçek scooterlar
// giremez) ve her koşuda benzersiz bir test scooter'ı ("smoke-…") kullanır. Sadece kayıtlı
// scooterlar konum gönderebildiği için scooter koşu başında filoya eklenir, sonunda çıkarılır
// (yumuşak silme: sürücülerin seçim listesinde ve operasyonun filo ekranında görünmez).
// Kimlik benzersiz: aynı scooter'la arka arkaya koşulsaydı yeni koşunun konumları öncekinin
// son konumundan eski kalıp "geç gelen konum" olarak atlanabilirdi.
// Herhangi bir adım başarısız olursa 1 koduyla çıkar.

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(
  /\/$/,
  '',
);
const API_KEY = process.env.API_KEY ?? 'dev-api-key';
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 20_000);

const AREA_NAME = 'smoke-test-area';
const AREA = {
  name: AREA_NAME,
  type: 'NO_RIDE',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [-150.0, -60.0],
        [-149.99, -60.0],
        [-149.99, -59.99],
        [-150.0, -59.99],
        [-150.0, -60.0],
      ],
    ],
  },
};
const INSIDE = { lat: -59.995, lng: -149.995 };
const OUTSIDE = { lat: -59.9, lng: -149.9 };

const userId = `smoke-${Date.now().toString(36)}`;
const started = Date.now();
let failures = 0;

async function call(method, path, { body, auth = true } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(auth ? { 'x-api-key': API_KEY } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // metrics gibi düz metin yanıtlar
  }
  return { status: res.status, json, text };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function step(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    console.log(`  ✓ ${name} (${Date.now() - t} ms)${note ? ` ${note}` : ''}`);
  } catch (err) {
    failures++;
    console.log(`  ✗ ${name}\n      ${err.message}`);
  }
}

/** Worker asenkron işlediği için koşul sağlanana kadar yoklar. */
async function waitFor(fn, what) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${TIMEOUT_MS} ms içinde gerçekleşmedi: ${what}`);
}

const ts = (msAgo) => new Date(Date.now() - msAgo).toISOString();
let areaId;

console.log(`Smoke testi: ${BASE_URL} (scooter ${userId})\n`);

await step('servis sağlıklı (DB + Redis)', async () => {
  const { status, json } = await call('GET', '/health', { auth: false });
  expect(status === 200, `GET /health → ${status}`);
  expect(
    json.database === 'up' && json.redis === 'up',
    `health: ${JSON.stringify(json)}`,
  );
  return `kuyrukta bekleyen: ${json.queue.waiting}`;
});

await step('anahtarsız istek reddedilir', async () => {
  const { status } = await call('GET', '/areas', { auth: false });
  if (status === 200)
    return '(uyarı: sunucuda API_KEYS tanımlı değil, doğrulama kapalı)';
  expect(status === 401, `anahtarsız GET /areas → ${status}, 401 bekleniyordu`);
});

await step('POST /areas + GET /areas', async () => {
  const list = await call('GET', '/areas');
  expect(list.status === 200, `GET /areas → ${list.status}`);
  let area = list.json.find((a) => a.name === AREA_NAME);
  if (!area) {
    const created = await call('POST', '/areas', { body: AREA });
    expect(
      created.status === 201,
      `POST /areas → ${created.status} ${created.text}`,
    );
    area = created.json;
    const again = await call('GET', '/areas');
    expect(
      again.json.some((a) => a.id === area.id),
      'yeni alan GET /areas içinde yok',
    );
  }
  expect(area.geometry?.type === 'Polygon', 'alan geometrisi Polygon değil');
  areaId = area.id;
  return `alan ${areaId}`;
});

await step('test scooter filoda; kayıtsız scooter reddedilir', async () => {
  const created = await call('POST', '/scooters', {
    body: { id: userId, name: 'Smoke testi' },
  });
  expect(
    created.status === 201,
    `POST /scooters → ${created.status} ${created.text}`,
  );
  const unknown = await call('POST', '/locations', {
    body: {
      userId: `kayitsiz-${Date.now().toString(36)}`,
      ...OUTSIDE,
      timestamp: ts(3000),
    },
  });
  expect(
    unknown.status === 400,
    `kayıtsız scooter → ${unknown.status}, 400 bekleniyordu`,
  );
});

const entryTime = ts(2000);
await step('POST /locations (dışarı → içeri)', async () => {
  const outside = await call('POST', '/locations', {
    body: { userId, ...OUTSIDE, timestamp: ts(3000) },
  });
  expect(
    outside.status === 202,
    `POST /locations → ${outside.status} ${outside.text}`,
  );
  const inside = await call('POST', '/locations', {
    body: { userId, ...INSIDE, timestamp: entryTime },
  });
  expect(
    inside.status === 202,
    `POST /locations → ${inside.status} ${inside.text}`,
  );
});

await step(
  'giriş GET /logs içinde (User ID, Area ID, Entry Time)',
  async () => {
    expect(areaId, 'alan oluşturulamadığı için atlandı');
    const log = await waitFor(async () => {
      const { json } = await call(
        'GET',
        `/logs?userId=${userId}&areaId=${areaId}`,
      );
      return json?.data?.[0];
    }, 'giriş kaydı');
    expect(log.userId === userId, `userId ${log.userId}`);
    expect(log.areaId === areaId, `areaId ${log.areaId}`);
    expect(
      log.entryTime === entryTime,
      `entryTime ${log.entryTime}, beklenen ${entryTime}`,
    );
    return `(${log.entryTime})`;
  },
);

await step('çıkışta exitTime dolar', async () => {
  const res = await call('POST', '/locations', {
    body: { userId, ...OUTSIDE, timestamp: ts(1000) },
  });
  expect(res.status === 202, `POST /locations → ${res.status}`);
  await waitFor(async () => {
    const { json } = await call(
      'GET',
      `/logs?userId=${userId}&areaId=${areaId}`,
    );
    return json?.data?.[0]?.exitTime;
  }, 'exitTime');
});

await step('eksik timestamp 400 ile reddedilir', async () => {
  const { status } = await call('POST', '/locations', {
    body: { userId, ...INSIDE },
  });
  expect(status === 400, `→ ${status}`);
});

await step('test scooter filodan çıkarılır', async () => {
  const { status, text } = await call('DELETE', `/scooters/${userId}`);
  expect(status === 204, `DELETE /scooters → ${status} ${text}`);
});

await step('metrikler yayınlanıyor', async () => {
  const { status, text } = await call('GET', '/metrics', { auth: false });
  expect(status === 200, `GET /metrics → ${status}`);
  expect(
    text.includes('locations_accepted_total'),
    'locations_accepted_total yok',
  );
});

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  failures
    ? `\n${failures} adım BAŞARISIZ (${seconds} sn)`
    : `\nTüm adımlar geçti (${seconds} sn)`,
);
process.exit(failures ? 1 : 0);
