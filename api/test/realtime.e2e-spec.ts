import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import {
  createTestApp,
  INSIDE,
  MODA_SQUARE,
  registerRider,
  rentScooter,
  resetState,
} from './helpers.js';

const KEY = 'ws-key';

describe('Canlı yayın (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const sockets: Socket[] = [];

  const connect = (apiKey?: string) => {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: apiKey ? { 'x-api-key': apiKey } : {},
    });
    sockets.push(socket);
    return socket;
  };
  /** Sürücü oturumuyla bağlantı (sürücü uygulaması gibi token el sıkışmada gider). */
  const connectRider = (token: string) => {
    const socket = io(url, {
      transports: ['websocket'],
      reconnection: false,
      auth: { token },
    });
    sockets.push(socket);
    return socket;
  };
  const connected = (socket: Socket) =>
    new Promise<void>((resolve) => socket.on('connect', () => resolve()));

  beforeAll(async () => {
    app = await createTestApp({
      config: (c) => ({
        ...c,
        realtime: { ...c.realtime, enabled: true, flushIntervalMs: 50 },
        security: {
          ...c.security,
          apiKeys: [KEY],
        },
      }),
    });
    await resetState(app);
    const { port } = app.getHttpServer().address() as AddressInfo;
    url = `http://localhost:${port}`;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await app.close();
  });

  it('anahtarsız bağlantıyı kapatır', async () => {
    const socket = connect();
    const reason = await new Promise<string>((resolve) =>
      socket.on('disconnect', resolve),
    );
    expect(reason).toBe('io server disconnect');
  });

  it('sürücü sadece kiraladığı scooter odasına girer, tüm filonun yayınına giremez', async () => {
    const token = await registerRider(app, 'ws-surucu-1');
    await rentScooter(app, token, 'scooter-01').expect(201);
    const socket = connectRider(token);
    await connected(socket);
    expect(
      await socket.emitWithAck('subscribe', { userId: 'scooter-01' }),
    ).toEqual({ ok: true });
    expect(
      await socket.emitWithAck('subscribe', { userId: 'scooter-02' }),
    ).toEqual({ ok: false, error: expect.stringMatching(/size kiralı değil/) });
    expect(await socket.emitWithAck('subscribe', { monitor: true })).toEqual({
      ok: false,
      error: expect.stringMatching(/API anahtarı ya da yönetici oturumu ister/),
    });

    const ops = connect(KEY);
    await connected(ops);
    expect(await ops.emitWithAck('subscribe', { monitor: true })).toEqual({
      ok: true,
    });
  });

  it("geçersiz sürücü token'ıyla bağlantı kapatılır", async () => {
    const socket = connectRider('gecersiz-token-1234567890');
    const reason = await new Promise<string>((resolve) =>
      socket.on('disconnect', resolve),
    );
    expect(reason).toBe('io server disconnect');
  });

  it("sürücü kiraladığı scooter'ın konumunu alır, başkasınınkini almaz; API anahtarı birden çok odada", async () => {
    const token = await registerRider(app, 'ws-surucu-2');
    await rentScooter(app, token, 'scooter-02').expect(201);
    const driver = connectRider(token);
    const ops = connect(KEY);
    await Promise.all([connected(driver), connected(ops)]);
    await driver.emitWithAck('subscribe', { userId: 'scooter-02' });
    for (const userId of ['room-a', 'scooter-02']) {
      await ops.emitWithAck('subscribe', { userId });
    }

    /** Soketin aldığı konumlar, geliş sırasıyla. */
    const seenBy = (socket: Socket) => {
      const users: string[] = [];
      socket.on('position', (p: { userId: string }) => users.push(p.userId));
      return users;
    };
    const driverSaw = seenBy(driver);
    const opsSaw = seenBy(ops);
    const send = (userId: string, secondsAgo: number) =>
      request(app.getHttpServer())
        .post('/locations')
        .set('x-api-key', KEY)
        .send({
          userId,
          ...INSIDE,
          timestamp: new Date(Date.now() - secondsAgo * 1000).toISOString(),
        })
        .expect(202);
    await send('room-a', 2);
    await send('scooter-02', 2);
    await vi.waitFor(() => {
      expect(new Set(opsSaw)).toEqual(new Set(['room-a', 'scooter-02']));
      expect(driverSaw).toContain('scooter-02');
    });

    // İşaret: scooter-02'ye bir konum daha. Aynı soketteki mesajlar sırayla gelir; sürücü
    // room-a'yı alsaydı (ops onu çoktan aldı) o mesaj işaretten önce ulaşmış olurdu.
    await send('scooter-02', 1);
    await vi.waitFor(() =>
      expect(driverSaw.filter((u) => u === 'scooter-02')).toHaveLength(2),
    );
    expect(driverSaw).not.toContain('room-a');
  });

  it('kiralama ve bırakma bağlı istemcilere duyurulur (sürücünün seçim ekranı yenilenir)', async () => {
    const token = await registerRider(app, 'ws-surucu-3');
    const watcher = connectRider(token);
    await connected(watcher);
    const changed = new Promise<{ change: string; scooterId: string }>(
      (resolve) => watcher.on('scooters-changed', resolve),
    );
    await rentScooter(app, token, 'scooter-03').expect(201);
    expect(await changed).toEqual({
      change: 'rentals',
      scooterId: 'scooter-03',
    });
  });

  it('olay odası (events) tüm filonun alan olaylarını alır, konum yayınını almaz; tam yetki ister', async () => {
    const token = await registerRider(app, 'ws-surucu-4');
    const driver = connectRider(token);
    const logs = connect(KEY);
    const monitor = connect(KEY);
    await Promise.all([connected(driver), connected(logs), connected(monitor)]);
    expect(await driver.emitWithAck('subscribe', { events: true })).toEqual({
      ok: false,
      error: expect.stringMatching(/API anahtarı ya da yönetici oturumu ister/),
    });
    expect(await logs.emitWithAck('subscribe', { events: true })).toEqual({
      ok: true,
    });
    await monitor.emitWithAck('subscribe', { monitor: true });

    await request(app.getHttpServer())
      .post('/areas')
      .set('x-api-key', KEY)
      .send({ name: 'Olay odası', type: 'PARKING', geometry: MODA_SQUARE })
      .expect(201);
    const logsGotPositions: unknown[] = [];
    logs.on('positions', (batch: unknown) => logsGotPositions.push(batch));
    const event = new Promise<{ userId: string; eventType: string }>(
      (resolve) =>
        logs.on(
          'area-event',
          (e: {
            userId: string;
            eventType: string;
            area: { name: string };
          }) => {
            if (e.area.name === 'Olay odası') resolve(e);
          },
        ),
    );
    const monitorGotPositions = new Promise<void>((resolve) =>
      monitor.once('positions', () => resolve()),
    );

    await request(app.getHttpServer())
      .post('/locations')
      .set('x-api-key', KEY)
      .send({
        userId: 'events-user',
        ...INSIDE,
        timestamp: new Date(Date.now() - 1000).toISOString(),
      })
      .expect(202);

    expect(await event).toMatchObject({
      userId: 'events-user',
      eventType: 'ENTER',
    });
    // Toplu konum yayını monitor'e ulaştı. Sunucu olay odasına da göndermiş olsaydı, aynı
    // soketteki sonraki cevaptan (ack) önce gelirdi: ack'ten sonra bakmak yarışsızdır.
    await monitorGotPositions;
    expect(await logs.emitWithAck('unsubscribe', { events: true })).toEqual({
      ok: true,
    });
    expect(logsGotPositions).toEqual([]);
  });

  it('yeni alan oluşturulunca bağlı istemcilere duyurur', async () => {
    const socket = connect(KEY);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const changed = new Promise<{ created: { name: string } }>((resolve) =>
      socket.on('areas-changed', resolve),
    );

    await request(app.getHttpServer())
      .post('/areas')
      .set('x-api-key', KEY)
      .send({ name: 'Yeni Park', type: 'PARKING', geometry: MODA_SQUARE })
      .expect(201);

    expect(await changed).toMatchObject({
      created: { name: 'Yeni Park', type: 'PARKING' },
    });
  });

  it('anahtarlı bağlantıda kullanıcıya giriş olayını iletir', async () => {
    await request(app.getHttpServer())
      .post('/areas')
      .set('x-api-key', KEY)
      .send({ name: 'Moda', type: 'NO_RIDE', geometry: MODA_SQUARE })
      .expect(201);

    const socket = connect(KEY);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const ack = await socket.emitWithAck('subscribe', { userId: 'ws-user' });
    expect(ack).toEqual({ ok: true });

    // Önceki testin alanı aynı geometride; bu testin alanına ait olayı bekle.
    const event = new Promise<{ eventType: string; area: { name: string } }>(
      (resolve) =>
        socket.on('area-event', (e: { area: { name: string } }) => {
          if (e.area.name === 'Moda') resolve(e as never);
        }),
    );
    await request(app.getHttpServer())
      .post('/locations')
      .set('x-api-key', KEY)
      .send({
        userId: 'ws-user',
        ...INSIDE,
        timestamp: new Date(Date.now() - 1000).toISOString(),
      })
      .expect(202);

    expect(await event).toMatchObject({
      eventType: 'ENTER',
      area: { name: 'Moda' },
    });
  });
});

describe('Canlı yayın bağlantı sağlığı (e2e)', () => {
  let app: INestApplication;
  let port: number;

  beforeAll(async () => {
    app = await createTestApp({
      withWorker: false,
      config: (c) => ({
        ...c,
        realtime: {
          ...c.realtime,
          enabled: true,
          pingIntervalMs: 100,
          pingTimeoutMs: 200,
        },
        security: { ...c.security, apiKeys: [KEY] },
      }),
    });
    port = (app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(() => app.close());

  it("ping'e cevap vermeyen bağlantıyı ping aralığı + bekleme süresi içinde kapatır", async () => {
    // Ham engine.io bağlantısı: ping'lere ("2") hiç cevap ("3") vermez, uygulaması
    // kapanmış ya da ağı kopmuş bir cihaz gibi.
    const ws = new WebSocket(
      `ws://localhost:${port}/socket.io/?EIO=4&transport=websocket`,
    );
    const opened = Date.now();
    const handshake = new Promise<{
      pingInterval: number;
      pingTimeout: number;
    }>((resolve) =>
      ws.addEventListener('message', (e) => {
        const data = String(e.data);
        if (data.startsWith('0')) resolve(JSON.parse(data.slice(1)));
      }),
    );
    const closed = new Promise<number>((resolve) =>
      ws.addEventListener('close', () => resolve(Date.now() - opened)),
    );

    expect(await handshake).toMatchObject({
      pingInterval: 100,
      pingTimeout: 200,
    });
    const after = await closed;
    expect(after).toBeGreaterThanOrEqual(250);
    expect(after).toBeLessThan(1500);
  });

  it("ping'e cevap veren bağlantı açık kalır", async () => {
    const socket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { 'x-api-key': KEY },
    });
    try {
      await new Promise<void>((resolve) =>
        socket.on('connect', () => resolve()),
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(socket.connected).toBe(true);
    } finally {
      socket.close();
    }
  });
});
