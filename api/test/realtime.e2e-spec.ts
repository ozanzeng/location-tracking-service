import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { createTestApp, INSIDE, MODA_SQUARE, resetState } from './helpers.js';

const KEY = 'ws-key';
const DRIVER_KEY = 'ws-driver-key';

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

  beforeAll(async () => {
    app = await createTestApp({
      config: (c) => ({
        ...c,
        realtime: { ...c.realtime, enabled: true, flushIntervalMs: 50 },
        security: {
          ...c.security,
          apiKeys: [KEY],
          ingestApiKeys: [DRIVER_KEY],
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

  it('sürücü anahtarı kendi kullanıcı odasına girer, tüm filonun yayınına giremez', async () => {
    const socket = connect(DRIVER_KEY);
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    expect(await socket.emitWithAck('subscribe', { userId: 'drv-1' })).toEqual({
      ok: true,
    });
    expect(await socket.emitWithAck('subscribe', { monitor: true })).toEqual({
      ok: false,
      error: expect.stringMatching(/tam yetkili/),
    });

    const ops = connect(KEY);
    await new Promise<void>((resolve) => ops.on('connect', () => resolve()));
    expect(await ops.emitWithAck('subscribe', { monitor: true })).toEqual({
      ok: true,
    });
  });

  it('sürücü bağlantısı aynı anda tek kullanıcı odasında durur; tam yetkili bağlantı birden çok odada', async () => {
    const connected = (socket: Socket) =>
      new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    const driver = connect(DRIVER_KEY);
    const ops = connect(KEY);
    await Promise.all([connected(driver), connected(ops)]);
    for (const userId of ['room-a', 'room-b']) {
      await driver.emitWithAck('subscribe', { userId });
      await ops.emitWithAck('subscribe', { userId });
    }

    const seenBy = (socket: Socket) => {
      const users = new Set<string>();
      socket.on('position', (p: { userId: string }) => users.add(p.userId));
      return users;
    };
    const driverSaw = seenBy(driver);
    const opsSaw = seenBy(ops);
    for (const userId of ['room-a', 'room-b']) {
      await request(app.getHttpServer())
        .post('/locations')
        .set('x-api-key', KEY)
        .send({
          userId,
          ...INSIDE,
          timestamp: new Date(Date.now() - 1000).toISOString(),
        })
        .expect(202);
    }

    await vi.waitFor(() =>
      expect(opsSaw).toEqual(new Set(['room-a', 'room-b'])),
    );
    // Sürücü ikinci aboneliğinde ilk odadan çıkarıldı: sadece room-b'yi görür.
    expect(driverSaw).toEqual(new Set(['room-b']));
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
