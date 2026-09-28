import type { DataSource } from 'typeorm';
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  USERNAME_PATTERN,
} from '../config/limits.js';
import { hashPassword } from '../riders/password.js';
import { AdminWrite } from './admin-write.enum.js';

/**
 * Yönetici hesabını şema sahibi bağlantısıyla yazar (uygulama rolü admins'e ekleyemez).
 * Sonuç: 'oluşturuldu', 'şifre güncellendi' ya da 'zaten var'.
 */
export async function ensureAdmin(
  ds: DataSource,
  username: string,
  password: string,
  mode: AdminWrite,
): Promise<'oluşturuldu' | 'şifre güncellendi' | 'zaten var'> {
  const name = username.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(name)) {
    throw new Error(`Geçersiz yönetici adı: "${username}"`);
  }
  if (
    password.length < ADMIN_PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    throw new Error(
      `Yönetici şifresi ${ADMIN_PASSWORD_MIN_LENGTH}–${PASSWORD_MAX_LENGTH} karakter olmalı`,
    );
  }
  const hash = await hashPassword(password);
  const [row]: Array<{ inserted: boolean }> = await ds.query(
    mode === AdminWrite.UPSERT
      ? `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
         ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
         RETURNING (xmax = 0) AS inserted`
      : `INSERT INTO admins (username, password_hash) VALUES ($1, $2)
         ON CONFLICT (username) DO NOTHING
         RETURNING true AS inserted`,
    [name, hash],
  );
  if (!row) return 'zaten var';
  return row.inserted ? 'oluşturuldu' : 'şifre güncellendi';
}
