import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { createRedis } from '../common/redis/create-redis.js';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';

/** Bir kullanıcı bu süre konum göndermezse sıra sayaçları Redis'ten silinir. */
const KEY_TTL_SECONDS = 24 * 60 * 60;

/**
 * Yeni sıra no; sayaç ilk kez oluşuyorsa "tamamlanan" sayacı 0'dan başlatılır. Böylece
 * worker "önceki iş henüz gelmedi" ile "sayaç yok, sıra bilinmiyor" durumlarını ayırır.
 * KEYS: sıra sayacı, tamamlanan sayacı. ARGV: TTL.
 */
const NEXT_SCRIPT = `
local seq = redis.call('INCR', KEYS[1])
if seq == 1 then redis.call('SET', KEYS[2], 0) end
redis.call('EXPIRE', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[1])
return seq
`;

/**
 * Tamamlanan sıra sadece ileri gider (zaman aşımıyla sırasız işlenen iş geri almasın).
 * Sıradaki iş bekliyorsa kimliğini döner; worker onu beklemeden öne alır.
 * KEYS: tamamlanan sayacı, sıradaki işin bekleme kaydı. ARGV: sıra no, TTL.
 */
const COMPLETE_SCRIPT = `
local done = tonumber(redis.call('GET', KEYS[1]) or '0')
if tonumber(ARGV[1]) > done then redis.call('SET', KEYS[1], ARGV[1]) end
redis.call('EXPIRE', KEYS[1], ARGV[2])
local waiting = redis.call('GET', KEYS[2])
if waiting then redis.call('DEL', KEYS[2]) end
return waiting
`;

/** Bekleme kaydı en fazla bu kadar tutulur; sonrası için periyodik yeniden deneme yeter. */
const WAITING_TTL_SECONDS = 120;

type SequencerRedis = Redis & {
  nextSeq(seqKey: string, doneKey: string, ttl: number): Promise<number>;
  completeSeq(
    doneKey: string,
    waitingKey: string,
    seq: number,
    ttl: number,
  ): Promise<string | null>;
};

/**
 * Kullanıcı başına iş sırası. Cihaz uzun kopukluktan sonra birikmiş konumları 100'lük
 * istekler halinde gönderir; her istek ayrı iştir ve paralel worker'lar yeni işi eskisinden
 * önce işleyebilir. O zaman eski noktalar "geç gelmiş" sayılıp atlanır, aradaki giriş/çıkışlar
 * kaybolurdu. API her işe kullanıcının bir sonraki sıra numarasını verir; worker sırası
 * gelmemiş işi erteler, önceki iş bitince onu öne alır (bkz. job-order.ts).
 */
@Injectable()
export class UserSequencer implements OnModuleDestroy {
  private readonly redis: SequencerRedis;
  private readonly prefix: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.prefix = `${config.queue.prefix}:seq`;
    const redis = createRedis(config.redisUrl, {
      lazyConnect: true,
      failFast: true,
    });
    redis.defineCommand('nextSeq', { numberOfKeys: 2, lua: NEXT_SCRIPT });
    redis.defineCommand('completeSeq', {
      numberOfKeys: 2,
      lua: COMPLETE_SCRIPT,
    });
    this.redis = redis as SequencerRedis;
  }

  /** API: kullanıcıların yeni işlerinin sıra numaraları (aynı sırayla). */
  next(userIds: string[]): Promise<number[]> {
    // ioredis eşzamanlı komutları tek bağlantıda beklemeden art arda yazar (tek tur).
    return Promise.all(
      userIds.map((userId) =>
        this.redis.nextSeq(
          this.seqKey(userId),
          this.doneKey(userId),
          KEY_TTL_SECONDS,
        ),
      ),
    );
  }

  /** Worker: kullanıcının tamamlanmış en büyük sıra no'su; sayaç yoksa null. */
  async lastCompleted(userId: string): Promise<number | null> {
    const value = await this.redis.get(this.doneKey(userId));
    return value === null ? null : Number(value);
  }

  /** Worker: sırası gelmeyen iş ertelenirken kendini kaydeder; önceki iş bitince öne alınır. */
  async markWaiting(userId: string, seq: number, jobId: string): Promise<void> {
    await this.redis.set(
      this.waitingKey(userId, seq),
      jobId,
      'EX',
      WAITING_TTL_SECONDS,
    );
  }

  /** Worker: iş bitti. Sıradaki iş ertelenmiş bekliyorsa kimliği döner. */
  complete(userId: string, seq: number): Promise<string | null> {
    return this.redis.completeSeq(
      this.doneKey(userId),
      this.waitingKey(userId, seq + 1),
      seq,
      KEY_TTL_SECONDS,
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  private seqKey(userId: string) {
    return `${this.prefix}:${userId}`;
  }

  private doneKey(userId: string) {
    return `${this.prefix}:${userId}:done`;
  }

  private waitingKey(userId: string, seq: number) {
    return `${this.prefix}:${userId}:waiting:${seq}`;
  }
}
