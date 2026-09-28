import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

/**
 * Şifrenin SCRAM-SHA-256 doğrulayıcısı; Postgres'in saklarken ürettiğiyle aynı biçim
 * (psql'in \password komutu da şifreyi böyle gönderir). ALTER/CREATE ROLE ... PASSWORD metni
 * pg_stat_statements'ta, sunucu loglarında (log_statement=ddl) ve hata mesajlarında
 * görünebilir; düz şifre yerine bu gönderilir. Doğrulayıcıdan şifre elde edilemez ve onunla
 * oturum açılamaz (yalnızca zayıf bir şifreye çevrimdışı tahmin denenebilir).
 *
 * Postgres şifreyi SASLprep ile normalleştirir; ASCII şifrelerde bu işlem şifreyi değiştirmez,
 * diğerlerinde NFKC karşılığıdır (tanımsız karakterli şifreyi Postgres olduğu gibi kullanır).
 */
export function scramSha256Verifier(
  password: string,
  salt: Buffer = randomBytes(16),
  iterations = 4096,
): string {
  const salted = pbkdf2Sync(
    password.normalize('NFKC'),
    salt,
    iterations,
    32,
    'sha256',
  );
  const hmac = (text: string) =>
    createHmac('sha256', salted).update(text).digest();
  const storedKey = createHash('sha256').update(hmac('Client Key')).digest();
  const serverKey = hmac('Server Key');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey.toString('base64')}:${serverKey.toString('base64')}`;
}
