import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { createTestApp, INSIDE } from './helpers.js';

/**
 * Deploy ve ölçek küçültmede süreç kapanırken gelen istekler: HTTP sunucusu kapanana kadar
 * bağlantılar (rate limit Redis'i, kuyruklar) açık kalmalı. Önceden bağlantılar HTTP sunucusundan
 * önce kapanıyor, o anda işlenen konumlar 500 alıyordu.
 */
describe('Kapanırken gelen istekler (e2e)', () => {
  it('500 almaz: ya işlenir (202) ya da tekrar denenmek üzere reddedilir (503)', async () => {
    const app = await createTestApp({
      withWorker: false,
      config: (c) => ({
        ...c,
        security: { ...c.security, userRateLimitPerMinute: 1000 },
      }),
    });
    const { port } = app.getHttpServer().address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;
    const statuses: number[] = [];
    let closed = false;

    const send = async (worker: number) => {
      for (let i = 0; !closed; i++) {
        try {
          const res = await request(url)
            .post('/locations')
            .send({
              userId: `shutdown-${worker}-${i % 50}`,
              ...INSIDE,
              timestamp: new Date(Date.now() - 1000).toISOString(),
            });
          statuses.push(res.status);
        } catch {
          // Sunucu kapandıktan sonra bağlantı reddedilir; istemci tekrar dener.
          return;
        }
      }
    };
    const senders = Array.from({ length: 20 }, (_, w) => send(w));
    await new Promise((resolve) => setTimeout(resolve, 200));
    await app.close();
    closed = true;
    await Promise.all(senders);

    expect(statuses.length).toBeGreaterThan(0);
    expect(statuses.filter((s) => s !== 202 && s !== 503)).toEqual([]);
  });
});
