// Veritabanı smoke testi: çalışan bir ortamın veritabanını HİÇBİR ŞEY YAZMADAN kontrol eder.
// Deploy sonrası "şema güncel ve ayarlar doğru mu?" sorusunu cevaplar.
// Kullanım: npm run build && npm run smoke:db   (DB_* ortam değişkenleri ya da api/.env)
// Herhangi bir adım başarısız olursa 1 koduyla çıkar.

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfigOrExit } from '../dist/config/configuration.js';
import { loadEnvFile } from '../dist/config/load-env.js';
import { typeOrmOptions } from '../dist/database/typeorm-options.js';

loadEnvFile();
const config = loadConfigOrExit();
const ds = new DataSource(typeOrmOptions(config));
let failures = 0;

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
const expect = (ok, message) => {
  if (!ok) throw new Error(message);
};
const one = async (sql) => (await ds.query(sql))[0];

console.log(`Veritabanı smoke testi: ${config.db.host}:${config.db.port}/${config.db.name}\n`);

await step('bağlantı', async () => {
  await ds.initialize();
  const { version } = await one(`SELECT current_setting('server_version') AS version`);
  return `PostgreSQL ${version}`;
});

await step('PostGIS kurulu', async () => {
  const { v } = await one(`SELECT postgis_lib_version() AS v`);
  return `PostGIS ${v}`;
});

await step('bekleyen migration yok', async () => {
  expect(!(await ds.showMigrations()), 'uygulanmamış migration var: npm run migration:run');
  const { n } = await one(`SELECT count(*)::int AS n FROM migrations`);
  return `${n} migration uygulanmış`;
});

await step('tablolar ve index’ler', async () => {
  const rows = await ds.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('areas', 'area_logs', 'user_last_location')`,
  );
  const names = new Set(rows.map((r) => r.indexname));
  const required = [
    'areas_geom_gist',
    'area_logs_open_visit_uq',
    'area_logs_open_entry_idx',
    'area_logs_entry_idx',
    'area_logs_user_idx',
    'area_logs_area_idx',
    'user_last_location_pkey',
  ];
  const missing = required.filter((n) => !names.has(n));
  expect(missing.length === 0, `eksik index: ${missing.join(', ')}`);
  const invalid = await ds.query(
    `SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE NOT i.indisvalid`,
  );
  // CONCURRENTLY yarıda kalırsa index geçersiz (INVALID) kalır; sorgular onu kullanmaz.
  expect(invalid.length === 0, `geçersiz index: ${invalid.map((r) => r.relname).join(', ')}`);
});

await step('son konum tablosu HOT güncellemeye uygun', async () => {
  const { reloptions } = await one(`SELECT reloptions FROM pg_class WHERE relname = 'user_last_location'`);
  expect((reloptions ?? []).includes('fillfactor=70'), `fillfactor=70 değil: ${reloptions}`);
  const { n } = await one(`SELECT count(*)::int AS n FROM pg_indexes WHERE tablename = 'user_last_location'`);
  expect(n === 1, `beklenmeyen index var (${n}); recorded_at index'i HOT güncellemeyi engeller`);
});

await step('oturum zaman aşımları etkin', async () => {
  const r = await one(
    `SELECT current_setting('statement_timeout') AS st, current_setting('idle_in_transaction_session_timeout') AS it`,
  );
  return `statement_timeout=${r.st}, idle_in_transaction_session_timeout=${r.it}`;
});

await step('giriş kayıtları dayanıklı (synchronous_commit)', async () => {
  const { v } = await ds.query(`SHOW synchronous_commit`).then((r) => ({ v: r[0].synchronous_commit }));
  expect(v === 'on', `synchronous_commit=${v}; giriş kayıtları çökmede kaybolabilir`);
});

await step('coğrafi sorgu çalışıyor', async () => {
  const { inside } = await one(
    `SELECT ST_Contains(ST_GeomFromText('POLYGON((0 0, 1 0, 1 1, 0 1, 0 0))', 4326), ST_SetSRID(ST_MakePoint(0.5, 0.5), 4326)) AS inside`,
  );
  expect(inside === true, 'ST_Contains beklenen sonucu vermedi');
  const { n } = await one(`SELECT count(*)::int AS n FROM areas`);
  return `${n} alan tanımlı`;
});

if (ds.isInitialized) await ds.destroy();
console.log(failures ? `\n${failures} adım BAŞARISIZ` : '\nTüm adımlar geçti');
process.exit(failures ? 1 : 0);
