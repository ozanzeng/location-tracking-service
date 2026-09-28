import { readdirSync } from 'node:fs';
import { MIGRATIONS } from './typeorm-options.js';

const FILE = /^(\d{13})-([A-Za-z]+)\.ts$/;
const files = readdirSync(new URL('./migrations/', import.meta.url))
  .map((f) => FILE.exec(f))
  .filter((m): m is RegExpExecArray => m !== null);

/**
 * Migration kuralları (README): dosya adı <zaman>-<Ad>.ts, sınıf ve `name` <Ad><zaman>; liste
 * zamana göre sıralı ve her dosya listede. Uygulanmış bir migration'ın adı ya da numarası
 * değiştirilmez: veritabanı smoke testi kodda olmayan uygulanmış migration'ı yakalar.
 */
describe('migration listesi', () => {
  it('her dosya MIGRATIONS listesinde, dosya sırasıyla', () => {
    const expected = files
      .toSorted((a, b) => a[1].localeCompare(b[1]))
      .map(([, ts, name]) => `${name}${ts}`);
    expect(MIGRATIONS.map((m) => m.name)).toEqual(expected);
  });

  it('sınıf adı ile TypeORM adı (`name`) aynı; zamanlar benzersiz ve artan', () => {
    const timestamps: number[] = [];
    for (const Migration of MIGRATIONS) {
      expect(new Migration().name).toBe(Migration.name);
      timestamps.push(Number(/(\d{13})$/.exec(Migration.name)?.[1]));
    }
    expect(timestamps).toEqual(timestamps.toSorted((a, b) => a - b));
    expect(new Set(timestamps).size).toBe(timestamps.length);
  });
});
