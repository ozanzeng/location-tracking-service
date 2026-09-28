import * as crypto from 'node:crypto';
import { PASSWORD_HASH } from '../config/limits.js';

const { randomBytes, scrypt, timingSafeEqual } = crypto;
// Argon2 Node 24.7'de geldi. Daha eski bir Node'da modül yüklenirken anlaşılmaz bir "export
// bulunamadı" hatası yerine ne yapılacağı söylensin (README, "Yerel geliştirme").
if (typeof crypto.argon2 !== 'function') {
  throw new Error(
    `Şifre özeti (Argon2id) için Node.js 24.7 veya üstü gerekli; şu an ${process.version}. api/.nvmrc'deki sürümü kullanın.`,
  );
}
const { argon2 } = crypto;

/**
 * Şifre özeti: Argon2id (Node 24'ün kendi crypto modülü, ek paket yok). Şifre saklamak için
 * OWASP'ın ilk önerisi: bellek isteyen bir türetme olduğu için sızan bir özet tablosundan
 * şifreleri ekran kartıyla kaba kuvvetle bulmak pahalıdır. Parametreler config/limits.ts'te
 * (PASSWORD_HASH; bu ortamda bir özet ~15 ms).
 *
 * Biçim PHC dizgesi: $argon2id$v=19$m=19456,t=2,p=1$tuz$özet (base64, dolgusuz); diğer
 * Argon2 kütüphaneleriyle uyumlu. Parametreler özetin içinde saklanır: ileride artırılırsa
 * eski özetler yine doğrulanır ve girişte yenilenir (needsRehash).
 *
 * İlk sürüm scrypt (N=2^14) kullanıyordu; bu OWASP'ın scrypt için verdiği asgari değerin
 * (N=2^17) altındaydı. O özetler hâlâ doğrulanır, sürücü giriş yapınca Argon2id'ye yenilenir.
 */
const {
  memoryKib: MEMORY_KIB,
  passes: PASSES,
  parallelism: PARALLELISM,
  tagLength: TAG_LENGTH,
  saltLength: SALT_LENGTH,
} = PASSWORD_HASH;
const PARAMS = `m=${MEMORY_KIB},t=${PASSES},p=${PARALLELISM}`;
const PREFIX = `$argon2id$v=19$${PARAMS}$`;

const b64 = (buf: Buffer) => buf.toString('base64').replace(/=+$/, '');

function argon2id(
  password: string,
  salt: Buffer,
  memory: number,
  passes: number,
  parallelism: number,
  tagLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    argon2(
      'argon2id',
      {
        // Aynı şifre farklı Unicode biçimlerinde (ş: tek karakter ya da s + birleşen işaret)
        // aynı özeti versin.
        message: password.normalize('NFC'),
        nonce: salt,
        memory,
        passes,
        parallelism,
        tagLength,
      },
      (err, key) => (err ? reject(err) : resolve(key)),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await argon2id(
    password,
    salt,
    MEMORY_KIB,
    PASSES,
    PARALLELISM,
    TAG_LENGTH,
  );
  return `${PREFIX}${b64(salt)}$${b64(key)}`;
}

/** Sabit süreli karşılaştırma; biçimi bozuk ya da bilinmeyen özet için false. */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  if (stored.startsWith('$argon2id$')) return verifyArgon2id(password, stored);
  if (stored.startsWith('scrypt$')) return verifyLegacyScrypt(password, stored);
  return false;
}

/** Özet güncel yöntem ve parametrelerle mi; değilse başarılı girişte yenilenir. */
export function needsRehash(stored: string): boolean {
  return !stored.startsWith(PREFIX);
}

async function verifyArgon2id(
  password: string,
  stored: string,
): Promise<boolean> {
  // $argon2id$v=19$m=…,t=…,p=…$tuz$özet
  const [, , version, params, salt, key] = stored.split('$');
  const match = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(params ?? '');
  const expected = Buffer.from(key ?? '', 'base64');
  if (version !== 'v=19' || !match || !salt || expected.length < 4) {
    return false;
  }
  const [memory, passes, parallelism] = match.slice(1).map(Number);
  const actual = await argon2id(
    password,
    Buffer.from(salt, 'base64'),
    memory,
    passes,
    parallelism,
    expected.length,
  );
  return timingSafeEqual(expected, actual);
}

/** İlk sürümün biçimi: scrypt$N$r$p$tuz$özet. Sadece doğrulanır, yeni özet üretilmez. */
async function verifyLegacyScrypt(
  password: string,
  stored: string,
): Promise<boolean> {
  const [, n, r, p, salt, key] = stored.split('$');
  const params = [n, r, p].map(Number);
  const expected = Buffer.from(key ?? '', 'base64');
  if (
    !salt ||
    expected.length === 0 ||
    !params.every((v) => Number.isInteger(v) && v > 0)
  ) {
    return false;
  }
  const actual = await new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password.normalize('NFC'),
      Buffer.from(salt, 'base64'),
      expected.length,
      {
        N: params[0],
        r: params[1],
        p: params[2],
        maxmem: 256 * params[0] * params[1],
      },
      (err, derived) => (err ? reject(err) : resolve(derived)),
    ),
  );
  return timingSafeEqual(expected, actual);
}

/**
 * Kullanıcı adı yoksa da aynı süre harcansın diye karşılaştırılan sabit özet: yanıt süresinden
 * hangi kullanıcı adlarının kayıtlı olduğu anlaşılamasın.
 */
let dummyHash: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword('yok-boyle-bir-sifre');
  return dummyHash;
}
