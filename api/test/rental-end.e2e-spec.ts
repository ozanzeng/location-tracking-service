import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  MODA_SQUARE,
  OUTSIDE,
  registerRider,
  rentScooter,
  resetState,
  waitForQueueDrain,
} from './helpers.js';

/** Park alanının içi, park yasak bölgenin dışı. */
const PARKED = { lat: 40.982, lng: 29.022 };
/** Park alanının doğu kenarının ~40 m içi ve ~40 m dışı (kuyruk gecikmesi senaryosu). */
const EDGE_INSIDE = { lat: 40.985, lng: 29.0295 };
const EDGE_OUTSIDE = { lat: 40.985, lng: 29.0305 };
/** Park alanının içinde kalan park yasak bölge. */
const NO_PARKING_SQUARE = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [29.024, 40.984],
      [29.026, 40.984],
      [29.026, 40.986],
      [29.024, 40.986],
      [29.024, 40.984],
    ],
  ],
};
const IN_NO_PARKING = { lat: 40.985, lng: 29.025 };

/**
 * Sürüş sadece park alanında biter (sunucu kuralı; sürücü uygulamasındaki kontrole güvenilmez).
 * Bitiş noktası cihazın gönderdiği konum, o yoksa sunucudaki son konum.
 */
describe('Sürüşü bitirme: park kuralı (e2e)', () => {
  let app: INestApplication;
  let rider: string;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = () => ({ authorization: `Bearer ${rider}` });
  const ride = async (
    scooterId: string,
    point: { lat: number; lng: number },
  ) => {
    await http()
      .post('/locations')
      .set(auth())
      .send({
        userId: scooterId,
        ...point,
        timestamp: new Date(Date.now() - 5000 + seq++).toISOString(),
      })
      .expect(202);
    await waitForQueueDrain(app);
  };
  const end = (body?: object) =>
    http().post('/rentals/current/end').set(auth()).send(body);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetState(app);
    for (const [name, type, geometry] of [
      ['Moda park', 'PARKING', MODA_SQUARE],
      ['Moda iskele önü', 'NO_PARKING', NO_PARKING_SQUARE],
    ] as const) {
      await http().post('/areas').send({ name, type, geometry }).expect(201);
    }
    rider = await registerRider(app, `bitis-${seq++}`);
  });
  afterAll(async () => {
    await waitForQueueDrain(app);
    await app.close();
  });

  it('hiç sürülmeden bırakılan scooter (kiralamada konum yok) bırakılabilir', async () => {
    await rentScooter(app, rider, 'scooter-01').expect(201);
    await end().expect(200);
  });

  it('son konumu park alanında olan sürüş biter', async () => {
    await rentScooter(app, rider, 'scooter-01').expect(201);
    await ride('scooter-01', PARKED);
    const res = await end().expect(200);
    expect(res.body).toMatchObject({
      scooterId: 'scooter-01',
      endReason: 'RETURNED',
    });
  });

  it('park alanı dışında biten sürüş reddedilir, en yakın park söylenir; kiralama sürer', async () => {
    await rentScooter(app, rider, 'scooter-01').expect(201);
    await ride('scooter-01', OUTSIDE);
    const res = await end().expect(409);
    expect(res.body.message).toMatch(
      /En yakın park alanı: Moda park, yaklaşık \d+ m/,
    );
    const current = await http()
      .get('/rentals/current')
      .set(auth())
      .expect(200);
    expect(current.body.rental).toMatchObject({ scooterId: 'scooter-01' });
  });

  it('park alanının içindeki park yasak bölgede bitmez', async () => {
    await rentScooter(app, rider, 'scooter-01').expect(201);
    await ride('scooter-01', IN_NO_PARKING);
    await end()
      .expect(409)
      .expect((res) => expect(res.body.message).toMatch(/Park yasak bölgede/));
  });

  it('kuyruk gecikmesi: sunucudaki son konum park dışında kaldıysa cihazın bildirdiği yakın konumla biter', async () => {
    await rentScooter(app, rider, 'scooter-01').expect(201);
    await ride('scooter-01', EDGE_OUTSIDE);
    await end(EDGE_INSIDE).expect(200);
  });

  it('park halindeki konum (kiralamadan önce) bitişte sayılmaz', async () => {
    // Scooter kiralanmadan önce park dışında bildirilmiş (API anahtarıyla, filo sistemi).
    await http()
      .post('/locations')
      .send({
        userId: 'scooter-02',
        ...OUTSIDE,
        timestamp: new Date(Date.now() - 60_000).toISOString(),
      })
      .expect(202);
    await waitForQueueDrain(app);
    await rentScooter(app, rider, 'scooter-02').expect(201);
    await end().expect(200);
  });

  it('eksik konum (sadece lat) 400', async () => {
    await rentScooter(app, rider, 'scooter-01').expect(201);
    await end({ lat: 40.98 }).expect(400);
  });
});
