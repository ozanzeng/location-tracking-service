import { isTransientError } from './transient-error.js';

const withCode = (code: string, message = 'hata') =>
  Object.assign(new Error(message), { code });
/** TypeORM sorgu hatası: Postgres kodu driverError'da. */
const queryFailed = (code: string) =>
  Object.assign(new Error('sorgu hatası'), { driverError: { code } });

describe('isTransientError', () => {
  it.each([
    ['veritabanı kapalı', withCode('ECONNREFUSED')],
    [
      'DNS henüz çözülemiyor (konteyner yeniden başlıyor)',
      withCode('ENOTFOUND'),
    ],
    ['bağlantı sıfırlandı', withCode('ECONNRESET')],
    ['sistem açılıyor (57P03)', withCode('57P03')],
    ['yönetici kapattı (57P01)', queryFailed('57P01')],
    ['bağlantı sınırı (53300)', queryFailed('53300')],
    ['bağlantı hatası sınıfı (08006)', queryFailed('08006')],
    ['kilitlenme (40P01)', queryFailed('40P01')],
    ['sorgu zaman aşımı (57014)', queryFailed('57014')],
    [
      'kopan bağlantı (kodsuz)',
      new Error('Connection terminated unexpectedly'),
    ],
    [
      'havuzdan bağlantı alınamadı',
      new Error('timeout exceeded when trying to connect'),
    ],
  ])('geçici: %s', (_label, err) => {
    expect(isTransientError(err)).toBe(true);
  });

  it.each([
    ['CHECK kısıtı (23514)', queryFailed('23514')],
    ['benzersizlik (23505)', queryFailed('23505')],
    ['geçersiz metin (22P02)', queryFailed('22P02')],
    ['koddaki hata', new TypeError('Cannot read properties of undefined')],
    ['hata olmayan değer', 'metin'],
    ['null', null],
  ])('kalıcı: %s', (_label, err) => {
    expect(isTransientError(err)).toBe(false);
  });
});
