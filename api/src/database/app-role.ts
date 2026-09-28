import type { DataSource } from 'typeorm';
import { scramSha256Verifier } from './scram.js';
import { APP_TABLE_PRIVILEGES } from './app-role.constants.js';
import { DB_ROLE_NAME_PATTERN } from '../config/limits.js';

/**
 * Uygulama rolünü oluşturur ya da şifresini ve yetkilerini günceller; her migrate
 * çalışmasında tekrar çağrılır, sonuç hep aynıdır. Kimlik ve şifre SQL'e sunucunun
 * format() fonksiyonuyla (%I, %L) güvenle yerleştirilir. Şifre sunucuya düz değil
 * SCRAM doğrulayıcısı olarak gider: komut metni pg_stat_statements'a ve loglara düşebilir.
 */
export async function ensureAppRole(
  ds: DataSource,
  role: string,
  password: string,
): Promise<'oluşturuldu' | 'güncellendi'> {
  if (!DB_ROLE_NAME_PATTERN.test(role))
    throw new Error(`Geçersiz rol adı: ${role}`);
  const run = async (template: string, ...args: string[]) => {
    const params = args.map((_, i) => `$${i + 2}::text`).join(', ');
    const [{ sql }] = await ds.query(`SELECT format($1, ${params}) AS sql`, [
      template,
      ...args,
    ]);
    await ds.query(sql);
  };

  const exists =
    (await ds.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]))
      .length > 0;
  await run(
    `${exists ? 'ALTER' : 'CREATE'} ROLE %I WITH LOGIN NOSUPERUSER NOCREATEDB ` +
      'NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L',
    role,
    scramSha256Verifier(password),
  );
  const [{ db }] = await ds.query('SELECT current_database() AS db');
  await run('GRANT CONNECT ON DATABASE %I TO %I', db, role);
  await run('GRANT USAGE ON SCHEMA public TO %I', role);
  for (const [table, privileges] of Object.entries(APP_TABLE_PRIVILEGES)) {
    // Önceden verilmiş fazla yetki kalmasın.
    await run('REVOKE ALL ON TABLE %I FROM %I', table, role);
    await run(`GRANT ${privileges.join(', ')} ON TABLE %I TO %I`, table, role);
  }
  // area_logs.id ve rentals.id bigserial: yeni kayıt için dizilerin nextval'i.
  await run('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO %I', role);
  return exists ? 'güncellendi' : 'oluşturuldu';
}
