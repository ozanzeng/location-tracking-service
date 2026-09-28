import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfigOrExit } from '../config/configuration.js';
import { loadEnvFile } from '../config/load-env.js';
import { migrationOptions } from '../database/typeorm-options.js';
import { AdminWrite } from './admin-write.enum.js';
import { ensureAdmin } from './ensure-admin.js';

/**
 * Yönetici ekler ya da şifresini değiştirir:
 *   ADMIN_PASSWORD='...' npm run admin:set -- <kullanıcı-adı>
 * Docker'da: docker compose run --rm -e ADMIN_PASSWORD='...' migrate node dist/admins/admin-cli.js <ad>
 * Şifre komut satırına yazılmaz (kabuk geçmişine ve süreç listesine düşmesin), ortamdan okunur.
 */
loadEnvFile();
const username = process.argv[2];
const password = process.env.ADMIN_PASSWORD;
if (!username || !password) {
  console.error(
    "Kullanım: ADMIN_PASSWORD='...' npm run admin:set -- <kullanıcı-adı>",
  );
  process.exit(1);
}

const config = loadConfigOrExit({
  ...process.env,
  ADMIN_USERNAME: '',
  ADMIN_PASSWORD: '',
});
const dataSource = new DataSource(migrationOptions(config));
await dataSource.initialize();
try {
  const result = await ensureAdmin(
    dataSource,
    username,
    password,
    AdminWrite.UPSERT,
  );
  console.log(`Yönetici ${username.toLowerCase()} ${result}.`);
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await dataSource.destroy();
}
