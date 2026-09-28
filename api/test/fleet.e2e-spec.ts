import type { INestApplication } from '@nestjs/common';
import { randomBytes, scryptSync } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  INSIDE,
  logsFor,
  MODA_SQUARE,
  registerRider,
  rentScooter,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

const KEY = 'fleet-key';
const recent = () => new Date(Date.now() - 1000).toISOString();

/**
 * Sürücü hesapları, filo ve kiralama. Gerçek scooter kayıt listesiyle çalışır: sadece kayıtlı
 * scooter'lar konum gönderebilir.
 */
describe('Sürücüler, filo ve kiralama (e2e)', () => {
  let app: INestApplication;
  const server = () => app.getHttpServer();
  const asRider = (token: string) => ({ authorization: `Bearer ${token}` });
  const asOps = { 'x-api-key': KEY };
  const scooters = async (headers: Record<string, string>) =>
    (await request(server()).get('/scooters').set(headers).expect(200))
      .body as Array<{
      id: string;
      status: string;
      mine?: boolean;
      rider?: { username: string } | null;
    }>;

  beforeAll(async () => {
    app = await createTestApp({
      scooters: 'registered',
      config: (c) => ({
        ...c,
        security: { ...c.security, apiKeys: [KEY], loginMaxAttempts: 3 },
      }),
    });
  });
  beforeEach(async () => {
    await resetState(app);
  });
  afterAll(async () => {
    await waitForQueueDrain(app);
    await app.close();
  });

  describe('hesap', () => {
    it('üye olur, oturum açılır; kullanıcı adı küçük harfe çevrilir', async () => {
      const res = await request(server())
        .post('/auth/register')
        .send({ username: '  Ali.Yilmaz ', password: 'sifre-12345' })
        .expect(201);
      expect(res.body).toMatchObject({
        token: expect.any(String),
        expiresIn: 24 * 3600,
        rider: { username: 'ali.yilmaz' },
      });
      const me = await request(server())
        .get('/auth/me')
        .set(asRider(res.body.token))
        .expect(200);
      expect(me.body.username).toBe('ali.yilmaz');
    });

    it('aynı kullanıcı adı (büyük/küçük harf farkıyla da) ikinci kez alınamaz', async () => {
      await registerRider(app, 'veli');
      await request(server())
        .post('/auth/register')
        .send({ username: 'VELI', password: 'baska-sifre-1' })
        .expect(409);
    });

    it.each([
      [{ username: 'ab', password: 'sifre-12345' }, /username/],
      [{ username: 'ali veli', password: 'sifre-12345' }, /username/],
      [{ username: 'ayse', password: 'kisa' }, /password en az 8/],
    ])('geçersiz bilgiyle 400: %o', async (body, message) => {
      const res = await request(server())
        .post('/auth/register')
        .send(body)
        .expect(400);
      expect(JSON.stringify(res.body.message)).toMatch(message);
    });

    it('doğru şifreyle giriş; yanlış şifre ve olmayan kullanıcı aynı yanıtı alır', async () => {
      // Başarısız giriş sayacı kullanıcı adına bağlı ve Redis'te 15 dk kalır: adlar koşuya
      // özel, yoksa art arda koşularda sınır (3) dolup 429 gelir.
      const run = Date.now().toString(36);
      const username = `zeynep-${run}`;
      await registerRider(app, username, 'dogru-sifre-1');
      await request(server())
        .post('/auth/login')
        .send({ username: username.toUpperCase(), password: 'dogru-sifre-1' })
        .expect(200);
      const wrong = await request(server())
        .post('/auth/login')
        .send({ username, password: 'yanlis-sifre' })
        .expect(401);
      const missing = await request(server())
        .post('/auth/login')
        .send({ username: `olmayan-${run}`, password: 'yanlis-sifre' })
        .expect(401);
      expect(wrong.body.message).toBe(missing.body.message);
    });

    it('çok fazla başarısız denemeden sonra doğru şifre de 429 alır (Retry-After ile)', async () => {
      const username = `kilit-${Date.now().toString(36)}`;
      await registerRider(app, username, 'dogru-sifre-1');
      for (let i = 0; i < 3; i++) {
        await request(server())
          .post('/auth/login')
          .send({ username, password: 'yanlis-sifre' })
          .expect(401);
      }
      const res = await request(server())
        .post('/auth/login')
        .send({ username, password: 'dogru-sifre-1' })
        .expect(429);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it("ilk sürümün scrypt özetiyle kayıtlı sürücü giriş yapabilir; özeti Argon2id'ye yenilenir", async () => {
      const salt = randomBytes(16);
      const key = scryptSync('eski-sifre-1', salt, 64, {
        N: 16_384,
        r: 8,
        p: 1,
      });
      const db = app.get(DataSource);
      await db.query(
        `INSERT INTO riders (username, password_hash) VALUES ('eski-hesap', $1)`,
        [
          `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`,
        ],
      );
      await request(server())
        .post('/auth/login')
        .send({ username: 'eski-hesap', password: 'eski-sifre-1' })
        .expect(200);
      const [{ password_hash }] = await db.query(
        `SELECT password_hash FROM riders WHERE username = 'eski-hesap'`,
      );
      expect(password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      await request(server())
        .post('/auth/login')
        .send({ username: 'eski-hesap', password: 'eski-sifre-1' })
        .expect(200);
    });

    it('çıkıştan sonra token geçersizdir', async () => {
      const token = await registerRider(app, 'cikis');
      await request(server())
        .post('/auth/logout')
        .set(asRider(token))
        .expect(204);
      await request(server()).get('/auth/me').set(asRider(token)).expect(401);
    });
  });

  describe('filo', () => {
    it('kurulumda 5 scooter var, hepsi boşta', async () => {
      const list = await scooters(asOps);
      expect(list.map((s) => s.id)).toEqual([
        'scooter-01',
        'scooter-02',
        'scooter-03',
        'scooter-04',
        'scooter-05',
      ]);
      expect(list.every((s) => s.status === 'AVAILABLE')).toBe(true);
    });

    it('operasyon ekler ve siler; silinen aynı kimlikle geri eklenebilir', async () => {
      await request(server())
        .post('/scooters')
        .set(asOps)
        .send({ id: 'scooter-06', name: 'Scooter 06' })
        .expect(201);
      await request(server())
        .post('/scooters')
        .set(asOps)
        .send({ id: 'scooter-06' })
        .expect(409);
      expect((await scooters(asOps)).map((s) => s.id)).toContain('scooter-06');

      await request(server())
        .delete('/scooters/scooter-06')
        .set(asOps)
        .expect(204);
      expect((await scooters(asOps)).map((s) => s.id)).not.toContain(
        'scooter-06',
      );
      await request(server())
        .delete('/scooters/scooter-06')
        .set(asOps)
        .expect(404);
      await request(server())
        .post('/scooters')
        .set(asOps)
        .send({ id: 'scooter-06' })
        .expect(201);
    });

    it('kullanımdaki scooter silinemez', async () => {
      const token = await registerRider(app, 'silme');
      await rentScooter(app, token, 'scooter-01').expect(201);
      await request(server())
        .delete('/scooters/scooter-01')
        .set(asOps)
        .expect(409);
    });

    it('sürücü kimin kullandığını görmez, sadece boş mu ve kendisinin mi; operasyon kullanıcıyı görür', async () => {
      const ali = await registerRider(app, 'gorunum-ali');
      const veli = await registerRider(app, 'gorunum-veli');
      await rentScooter(app, ali, 'scooter-02').expect(201);

      const forVeli = (await scooters(asRider(veli))).find(
        (s) => s.id === 'scooter-02',
      );
      expect(forVeli).toMatchObject({ status: 'IN_USE', mine: false });
      expect(forVeli).not.toHaveProperty('rider');
      const forAli = (await scooters(asRider(ali))).find(
        (s) => s.id === 'scooter-02',
      );
      expect(forAli).toMatchObject({ mine: true });
      const forOps = (await scooters(asOps)).find((s) => s.id === 'scooter-02');
      expect(forOps?.rider).toMatchObject({ username: 'gorunum-ali' });
    });
  });

  describe('kiralama', () => {
    it('kiralanan scooter başkasına verilmez; bırakılınca tekrar boşa çıkar', async () => {
      const ali = await registerRider(app, 'kira-ali');
      const veli = await registerRider(app, 'kira-veli');
      await rentScooter(app, ali, 'scooter-01').expect(201);
      const busy = await rentScooter(app, veli, 'scooter-01').expect(409);
      expect(busy.body.message).toMatch(/kullanımda/);

      const ended = await request(server())
        .post('/rentals/current/end')
        .set(asRider(ali))
        .expect(200);
      expect(ended.body).toMatchObject({
        scooterId: 'scooter-01',
        endReason: 'RETURNED',
      });
      await rentScooter(app, veli, 'scooter-01').expect(201);
    });

    it('sürücü aynı anda tek scooter kullanır', async () => {
      const token = await registerRider(app, 'tek-scooter');
      await rentScooter(app, token, 'scooter-01').expect(201);
      const res = await rentScooter(app, token, 'scooter-02').expect(409);
      expect(res.body.message).toMatch(/Zaten bir scooter.*scooter-01/);
    });

    it("iki sürücü aynı scooter'a aynı anda basarsa sadece biri alır", async () => {
      const riders = await Promise.all(
        Array.from({ length: 5 }, (_, i) => registerRider(app, `yaris-${i}`)),
      );
      const results = await Promise.all(
        riders.map((token) => rentScooter(app, token, 'scooter-03')),
      );
      expect(results.map((r) => r.status).sort()).toEqual([
        201, 409, 409, 409, 409,
      ]);
    });

    it('5 scooter da doluysa listede boşta scooter kalmaz', async () => {
      for (let i = 1; i <= 5; i++) {
        const token = await registerRider(app, `dolu-${i}`);
        await rentScooter(app, token, `scooter-0${i}`).expect(201);
      }
      const late = await registerRider(app, 'gec-kalan');
      const list = await scooters(asRider(late));
      expect(list.filter((s) => s.status === 'AVAILABLE')).toEqual([]);
      await rentScooter(app, late, 'scooter-01').expect(409);
    });

    it('silinmiş ya da olmayan scooter kiralanamaz', async () => {
      const token = await registerRider(app, 'olmayan');
      await request(server())
        .delete('/scooters/scooter-05')
        .set(asOps)
        .expect(204);
      await rentScooter(app, token, 'scooter-05').expect(404);
      await rentScooter(app, token, 'yok-boyle-scooter').expect(404);
    });

    it('sayfa yenilenince aktif kiralama okunur; yoksa null', async () => {
      const token = await registerRider(app, 'devam');
      const none = await request(server())
        .get('/rentals/current')
        .set(asRider(token))
        .expect(200);
      expect(none.body).toEqual({ rental: null });
      await rentScooter(app, token, 'scooter-04').expect(201);
      const current = await request(server())
        .get('/rentals/current')
        .set(asRider(token))
        .expect(200);
      expect(current.body.rental).toMatchObject({ scooterId: 'scooter-04' });
    });
  });

  describe('konum gönderme', () => {
    const post = (headers: Record<string, string>, userId: string) =>
      request(server())
        .post('/locations')
        .set(headers)
        .send({ userId, ...INSIDE, timestamp: recent() });

    it('API anahtarı: kayıtlı scooter (kiralanmamış, park halinde de) gönderir; kayıtsız kimlik 400', async () => {
      await post(asOps, 'scooter-05').expect(202);
      const res = await post(asOps, 'kayitsiz-1').expect(400);
      expect(res.body.message).toMatch(/Kayıtlı olmayan scooter: kayitsiz-1/);
      await request(server())
        .post('/locations/batch')
        .set(asOps)
        .send({
          locations: [
            { userId: 'scooter-05', ...INSIDE, timestamp: recent() },
            { userId: 'kayitsiz-2', ...INSIDE, timestamp: recent() },
          ],
        })
        .expect(400);
    });

    it('eklenen scooter hemen gönderebilir, silinen hemen gönderemez', async () => {
      await post(asOps, 'yeni-scooter').expect(400);
      await request(server())
        .post('/scooters')
        .set(asOps)
        .send({ id: 'yeni-scooter' })
        .expect(201);
      await post(asOps, 'yeni-scooter').expect(202);
      await request(server())
        .delete('/scooters/yeni-scooter')
        .set(asOps)
        .expect(204);
      await post(asOps, 'yeni-scooter').expect(400);
    });

    it('sürücü: kiralama yokken 409, başka scooter adına 403, kiraladığı için 202', async () => {
      const token = await registerRider(app, 'gonderen');
      await post(asRider(token), 'scooter-01').expect(409);
      await rentScooter(app, token, 'scooter-01').expect(201);
      await post(asRider(token), 'scooter-02').expect(403);
      await post(asRider(token), 'scooter-01').expect(202);
    });

    it('sürüş bitince sürücü o scooter için gönderemez', async () => {
      const token = await registerRider(app, 'bitti');
      await rentScooter(app, token, 'scooter-02').expect(201);
      await request(server())
        .post('/rentals/current/end')
        .set(asRider(token))
        .expect(200);
      await post(asRider(token), 'scooter-02').expect(409);
    });

    it('sürücünün konumu işlenir ve alan girişi kiraladığı scooter adına kaydedilir', async () => {
      await request(server())
        .post('/areas')
        .set(asOps)
        .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
        .expect(201);
      const token = await registerRider(app, 'giris');
      await rentScooter(app, token, 'scooter-03').expect(201);
      await post(asRider(token), 'scooter-03').expect(202);
      await waitForQueueDrain(app);
      expect(await logsFor(app, 'scooter-03', KEY)).toHaveLength(1);
    });
  });

  describe('scooter detayı (operasyon)', () => {
    it('durum, kimde, son konum, içinde bulunduğu alan, kiralamalar ve cihaz günlüğü', async () => {
      const id = `detay-${Date.now().toString(36)}`;
      await request(server())
        .post('/scooters')
        .set(asOps)
        .send({ id, name: 'Detay testi' })
        .expect(201);
      await request(server())
        .post('/areas')
        .set(asOps)
        .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
        .expect(201);
      const token = await registerRider(app, 'detay-surucu');
      await rentScooter(app, token, id).expect(201);
      const now = Date.now();
      const at = (secondsAgo: number) =>
        new Date(now - secondsAgo * 1000).toISOString();
      const send = (secondsAgo: number) =>
        request(server())
          .post('/locations')
          .set(asRider(token))
          .set('x-request-id', `istek-${secondsAgo}`)
          .send({ userId: id, ...INSIDE, timestamp: at(secondsAgo) })
          .expect(202);
      await send(10);
      await waitForQueueDrain(app);
      // Daha eski bir konum: sunucu atlar, günlükte "eski" olarak görünür.
      await send(20);
      await waitForQueueDrain(app);

      const res = await request(server())
        .get(`/scooters/${id}`)
        .set(asOps)
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        registered: true,
        name: 'Detay testi',
        status: 'IN_USE',
        rider: { username: 'detay-surucu' },
        lastLocation: { ...INSIDE, recordedAt: at(10) },
        currentAreas: [{ name: 'Moda', type: 'NO_RIDE', since: at(10) }],
        rentals: [{ username: 'detay-surucu', endedAt: null }],
      });
      expect(
        res.body.deviceLog.map((e: { recordedAt: string; result: string }) => [
          e.recordedAt,
          e.result,
        ]),
      ).toEqual([
        [at(20), 'STALE'],
        [at(10), 'PROCESSED'],
      ]);
      expect(res.body.deviceLog[1]).toMatchObject({
        requestId: 'istek-10',
        events: [{ type: 'ENTER', area: { name: 'Moda' } }],
      });
    });

    it('filodan çıkarılmış scooterın detayı kayıtlarıyla açılır; hiç izi olmayan kimlik 404; sürücü 403', async () => {
      await request(server())
        .post('/locations')
        .set(asOps)
        .send({ userId: 'scooter-05', ...INSIDE, timestamp: recent() })
        .expect(202);
      await waitForQueueDrain(app);
      await request(server())
        .delete('/scooters/scooter-05')
        .set(asOps)
        .expect(204);
      const removed = await request(server())
        .get('/scooters/scooter-05')
        .set(asOps)
        .expect(200);
      expect(removed.body).toMatchObject({
        registered: false,
        status: null,
        removedAt: expect.any(String),
      });
      await request(server()).get('/scooters/hic-yok').set(asOps).expect(404);
      const token = await registerRider(app, 'detay-meraklisi');
      await request(server())
        .get('/scooters/scooter-01')
        .set(asRider(token))
        .expect(403);
    });
  });
});
