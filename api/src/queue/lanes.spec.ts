import { laneOf, laneQueueName } from './lanes.js';
import { laneJobOptions } from './location-lanes.js';

describe('laneOf', () => {
  it('aynı kullanıcı her zaman aynı şeride düşer', () => {
    for (const userId of ['scooter-1', 'load-4711', 'ü:ç.ş-_']) {
      expect(laneOf(userId, 64)).toBe(laneOf(userId, 64));
    }
  });

  it('süreçler ve sürümler arasında sabittir (FNV-1a bilinen değerleri)', () => {
    // FNV-1a 32 bit: "" → 0x811c9dc5, "a" → 0xe40c292c.
    expect(laneOf('', 2 ** 31)).toBe(0x811c9dc5 % 2 ** 31);
    expect(laneOf('a', 2 ** 31)).toBe(0xe40c292c % 2 ** 31);
  });

  it('kullanıcıları şeritlere dengeli dağıtır', () => {
    const counts: number[] = Array.from({ length: 64 }, () => 0);
    for (let i = 0; i < 64_000; i++) counts[laneOf(`scooter-${i}`, 64)]++;
    // Ortalama 1000; hiçbir şerit %20'den fazla sapmasın.
    expect(Math.min(...counts)).toBeGreaterThan(800);
    expect(Math.max(...counts)).toBeLessThan(1200);
  });

  it('her zaman [0, şerit sayısı) aralığında döner', () => {
    for (const lanes of [1, 7, 64]) {
      for (let i = 0; i < 500; i++) {
        const lane = laneOf(`u${i}`, lanes);
        expect(lane).toBeGreaterThanOrEqual(0);
        expect(lane).toBeLessThan(lanes);
      }
    }
  });

  it('kuyruk adı BullMQ\'nun kabul ettiği biçimdedir (":" yok)', () => {
    expect(laneQueueName(12)).toBe('locations-12');
  });
});

describe('laneJobOptions', () => {
  const keep = { keepCompleted: 1000, keepFailed: 5000 };

  it("Redis'te tutulan iş sayısı şerit sayısından bağımsız olarak toplamda aynı kalır", () => {
    for (const lanes of [1, 7, 64, 1024]) {
      const { removeOnComplete, removeOnFail } = laneJobOptions(lanes, keep);
      const completed = removeOnComplete.count * lanes;
      const failed = removeOnFail.count * lanes;
      // Yuvarlama yüzünden şerit başına en fazla 1 fazla.
      expect(completed).toBeGreaterThanOrEqual(keep.keepCompleted);
      expect(completed).toBeLessThan(keep.keepCompleted + lanes);
      expect(failed).toBeGreaterThanOrEqual(keep.keepFailed);
      expect(failed).toBeLessThan(keep.keepFailed + lanes);
    }
  });

  it('BullMQ yeniden denemesi kapalı (deneme işin içinde, sıra bozulmasın)', () => {
    expect(laneJobOptions(64, keep).attempts).toBe(1);
  });
});
