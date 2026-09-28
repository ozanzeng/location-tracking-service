import type { DataSource } from 'typeorm';

/**
 * API ve worker'ın veritabanı yetkileri: sadece yaptıkları işler. Şema sahibi (migration'ları
 * çalıştıran kullanıcı) superuser'dır; uygulama onunla bağlansaydı bir SQL enjeksiyonu
 * sunucuda komut çalıştırmaya (COPY ... TO PROGRAM) kadar gidebilir, superuser'lara ayrılan
 * bağlantı yuvalarını da tüketirdi. Yeni bir tablo eklenirse buraya da eklenmeli.
 */
export const APP_TABLE_PRIVILEGES: Record<string, string[]> = {
  // Alan oluşturma ve listeleme; güncelleme/silme API'de yok.
  areas: ['SELECT', 'INSERT'],
  // Giriş (INSERT) ve çıkış (UPDATE exit_time).
  area_logs: ['SELECT', 'INSERT', 'UPDATE'],
  // Son konum upsert'i.
  user_last_location: ['SELECT', 'INSERT', 'UPDATE'],
};

const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Uygulama rolünü oluşturur ya da şifresini ve yetkilerini günceller; her migrate
 * çalışmasında tekrar çağrılır, sonuç hep aynıdır. Kimlik ve şifre SQL'e sunucunun
 * format() fonksiyonuyla (%I, %L) güvenle yerleştirilir.
 */
export async function ensureAppRole(
  ds: DataSource,
  role: string,
  password: string,
): Promise<'oluşturuldu' | 'güncellendi'> {
  if (!ROLE_NAME.test(role)) throw new Error(`Geçersiz rol adı: ${role}`);
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
    password,
  );
  const [{ db }] = await ds.query('SELECT current_database() AS db');
  await run('GRANT CONNECT ON DATABASE %I TO %I', db, role);
  await run('GRANT USAGE ON SCHEMA public TO %I', role);
  for (const [table, privileges] of Object.entries(APP_TABLE_PRIVILEGES)) {
    // Önceden verilmiş fazla yetki kalmasın.
    await run('REVOKE ALL ON TABLE %I FROM %I', table, role);
    await run(`GRANT ${privileges.join(', ')} ON TABLE %I TO %I`, table, role);
  }
  // area_logs.id bigserial: yeni kayıt için dizinin nextval'i.
  await run('GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO %I', role);
  return exists ? 'güncellendi' : 'oluşturuldu';
}
