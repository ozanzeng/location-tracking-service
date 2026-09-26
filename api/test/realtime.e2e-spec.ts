import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { createTestApp, INSIDE, MODA_SQUARE, resetState } from './helpers.js';

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

  beforeAll(async () => {
    app = await createTestApp({
      config: (c) => ({
        ...c,
        realtime: { ...c.realtime, enabled: true, flushIntervalMs: 50 },
        security: { ...c.security, apiKeys: [KEY] },
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
