import { randomBytes, scryptSync } from 'node:crypto';
import { hashPassword, needsRehash, verifyPassword } from './password.js';

describe('şifre özeti (Argon2id)', () => {
  it('doğru şifreyi kabul eder, yanlışı reddeder', async () => {
    const hash = await hashPassword('dogru-sifre');
    await expect(verifyPassword('dogru-sifre', hash)).resolves.toBe(true);
    await expect(verifyPassword('yanlis-sifre', hash)).resolves.toBe(false);
  });

  it('PHC biçiminde, OWASP parametreleriyle; şifre özette açık durmaz, her seferinde farklı tuz', async () => {
    const a = await hashPassword('ayni-sifre');
    const b = await hashPassword('ayni-sifre');
    expect(a).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(a).not.toContain('ayni-sifre');
    expect(a).not.toBe(b);
    expect(needsRehash(a)).toBe(false);
  });

  it('Unicode şifreler aynı biçimde normalize edilir (ş: tek karakter ya da s + birleşen işaret)', async () => {
    const hash = await hashPassword('şifre');
    await expect(verifyPassword('s\u0327ifre', hash)).resolves.toBe(true);
  });

  it('ilk sürümün scrypt özetleri hâlâ doğrulanır ve yenilenmesi gerekir', async () => {
    const salt = randomBytes(16);
    const key = scryptSync('eski-sifre', salt, 64, { N: 16_384, r: 8, p: 1 });
    const legacy = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
    await expect(verifyPassword('eski-sifre', legacy)).resolves.toBe(true);
    await expect(verifyPassword('yanlis', legacy)).resolves.toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it('daha zayıf parametrelerle üretilmiş Argon2id özeti yenilenir', () => {
    expect(needsRehash('$argon2id$v=19$m=4096,t=1,p=1$c2FsdA$aGFzaA')).toBe(
      true,
    );
  });

  it.each([
    '',
    'bcrypt$x',
    'scrypt$16384$8$1$$',
    '$argon2id$v=19$m=x$tuz$ozet',
    '$argon2id$v=16$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2g',
  ])(
    'biçimi bozuk özet (%s) için false döner, hata fırlatmaz',
    async (stored) => {
      await expect(verifyPassword('x', stored)).resolves.toBe(false);
    },
  );
});
