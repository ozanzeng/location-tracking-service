import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AdminWrite } from '../src/admins/admin-write.enum.js';
import { ensureAdmin } from '../src/admins/ensure-admin.js';
import {
  createTestApp,
  INSIDE,
  MODA_SQUARE,
  registerRider,
  rentScooter,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

const KEY = 'yonetici-testi-anahtari';
const PASSWORD = 'yonetici-sifresi-123';
// Koşuya özel adlar: başarısız giriş sayacı Redis'te 15 dk yaşar, önceki koşuyu etkilemesin.
const RUN = Date.now().toString(36);

/**
 * Operasyon paneli yöneticisi: kullanıcı adı ve şifreyle giriş; operasyon uç noktalarına
 * erişir, konum gönderemez ve kiralayamaz. Hesaplar API'den açılmaz.
 */
describe('Yönetici girişi (e2e)', () => {
  let app: INestApplication;
  let adminName: string;

  const http = () => request(app.getHttpServer());
  const login = (username: string, password = PASSWORD) =>
    http().post('/auth/admin/login').send({ username, password });
  const tokenFor = async (username: string) =>
    ((await login(username).expect(200)).body as { token: string }).token;
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp({
      scooters: 'registered',
      config: (c) => ({
        ...c,
        security: { ...c.security, apiKeys: [KEY], loginMaxAttempts: 3 },
      }),
    });
    await resetState(app);
    adminName = `ayse-${RUN}`;
    await ensureAdmin(
      app.get(DataSource),
      adminName,
      PASSWORD,
      AdminWrite.CREATE_IF_MISSING,
    );
  });
  afterAll(async () => {
    await waitForQueueDrain(app);
    await app.close();
  });

  it('doğru şifreyle oturum açar; yanlış şifre ile olmayan kullanıcı aynı yanıtı alır', async () => {
    const res = await login(adminName.toUpperCase()).expect(200);
    expect(res.body).toMatchObject({
      token: expect.any(String),
      expiresIn: 12 * 3600,
      admin: { username: adminName },
    });
    const wrong = await login(adminName, 'yanlis-sifre-123').expect(401);
    const missing = await login(`yok-${RUN}`).expect(401);
    expect(wrong.body.message).toBe(missing.body.message);
    const [row] = await app
      .get(DataSource)
      .query('SELECT last_login_at FROM admins WHERE username = $1', [
        adminName,
      ]);
    expect(row.last_login_at).not.toBeNull();
  });

  it('3 başarısız denemeden sonra doğru şifre de 429 alır; sürücü adlarıyla sayaç karışmaz', async () => {
    const name = `kilit-${RUN}`;
    await ensureAdmin(
      app.get(DataSource),
      name,
      PASSWORD,
      AdminWrite.CREATE_IF_MISSING,
    );
    // Aynı adla bir sürücü hesabı: onun girişi yöneticinin sayacını etkilemez.
    await registerRider(app, name);
    for (let i = 0; i < 3; i++)
      await login(name, 'yanlis-sifre-123').expect(401);
    const locked = await login(name).expect(429);
    expect(Number(locked.headers['retry-after'])).toBeGreaterThan(0);
    await http()
      .post('/auth/login')
      .send({ username: name, password: 'sifre-12345' })
      .expect(200);
  });

  it('operasyon uç noktalarına erişir: kayıtlar, alan, filo, scooter detayı', async () => {
    const auth = bearer(await tokenFor(adminName));
    await http().get('/logs').set(auth).expect(200);
    await http().get('/locations/latest').set(auth).expect(200);
    const area = await http()
      .post('/areas')
      .set(auth)
      .send({ name: 'Yönetici alanı', type: 'PARKING', geometry: MODA_SQUARE })
      .expect(201);
    await http()
      .patch(`/areas/${area.body.id}`)
      .set(auth)
      .send({ name: 'Yeni ad' })
      .expect(200);
    await http()
      .post('/scooters')
      .set(auth)
      .send({ id: `yonetici-${RUN}` })
      .expect(201);
    await http().get(`/scooters/yonetici-${RUN}`).set(auth).expect(200);
    await http().delete(`/scooters/yonetici-${RUN}`).set(auth).expect(204);
    const me = await http().get('/auth/admin/me').set(auth).expect(200);
    expect(me.body).toEqual({ id: expect.any(String), username: adminName });
  });

  it('konum gönderemez, kiralayamaz; sürücü de yönetici uç noktalarına giremez', async () => {
    const auth = bearer(await tokenFor(adminName));
    await http()
      .post('/locations')
      .set(auth)
      .send({
        userId: 'scooter-01',
        ...INSIDE,
        timestamp: new Date().toISOString(),
      })
      .expect(403);
    await http()
      .post('/rentals')
      .set(auth)
      .send({ scooterId: 'scooter-01' })
      .expect(403);

    const rider = await registerRider(app, `surucu-${RUN}`);
    await http().get('/auth/admin/me').set(bearer(rider)).expect(403);
    await http().get('/logs').set(bearer(rider)).expect(403);
    // API anahtarı yönetici uç noktalarını açmaz: kimin adına olduğu belli olmalı.
    await http().get('/auth/admin/me').set('x-api-key', KEY).expect(401);
  });

  it('çıkıştan sonra token geçersiz', async () => {
    const auth = bearer(await tokenFor(adminName));
    await http().post('/auth/admin/logout').set(auth).expect(204);
    await http().get('/logs').set(auth).expect(401);
  });

  it('canlı yayında filo odasına abone olabilir; sürücü olamaz', async () => {
    const { port } = app.getHttpServer().address() as AddressInfo;
    const open = (token: string) =>
      io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        reconnection: false,
        auth: { token },
      });
    const subscribe = (socket: Socket) =>
      socket.emitWithAck('subscribe', { events: true }) as Promise<{
        ok: boolean;
      }>;

    const admin = open(await tokenFor(adminName));
    const rider = open(await registerRider(app, `canli-${RUN}`));
    try {
      await expect(subscribe(admin)).resolves.toEqual({ ok: true });
      await expect(subscribe(rider)).resolves.toMatchObject({ ok: false });
    } finally {
      admin.close();
      rider.close();
    }
  });

  it('işlem geçmişi: yöneticinin değişiklikleri kimin yaptığıyla loglanır', async () => {
    const auth = bearer(await tokenFor(adminName));
    const logged: string[] = [];
    const logger = (await import('@nestjs/common')).Logger;
    const spy = vi
      .spyOn(logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        logged.push(String(message));
      });
    try {
      await rentScooter(
        app,
        await registerRider(app, `gecmis-${RUN}`),
        'scooter-03',
      ).expect(201);
      await http()
        .post('/scooters')
        .set(auth)
        .send({ id: `gecmis-${RUN}` })
        .expect(201);
    } finally {
      spy.mockRestore();
    }
    expect(logged).toContain(`admin:${adminName} POST /scooters → 201`);
    // Sürücünün kiralaması işlem geçmişine yazılmaz (izi kiralamalarda).
    expect(logged.some((l) => l.includes('/rentals'))).toBe(false);
  });
});
