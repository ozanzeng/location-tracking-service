import { scramSha256Verifier } from './scram.js';

describe('SCRAM-SHA-256 doğrulayıcısı', () => {
  const salt = Buffer.from('0123456789abcdef');

  it("Postgres'in sakladığı biçimde; şifre metinde geçmez", () => {
    const verifier = scramSha256Verifier('gizli-sifre', salt);
    expect(verifier).toMatch(
      /^SCRAM-SHA-256\$4096:[A-Za-z0-9+/]+=*\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/,
    );
    expect(verifier).not.toContain('gizli-sifre');
  });

  it('aynı tuzla aynı, farklı tuzla farklı sonuç (her çağrıda rastgele tuz)', () => {
    expect(scramSha256Verifier('a', salt)).toBe(scramSha256Verifier('a', salt));
    expect(scramSha256Verifier('a')).not.toBe(scramSha256Verifier('a'));
  });
});
