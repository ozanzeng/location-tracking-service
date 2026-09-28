import type { DataSource } from 'typeorm';
import { loadConfig } from '../../src/config/configuration.js';
import { GeofenceRepository } from '../../src/geofence/geofence.repository.js';
import { GeofenceService } from '../../src/geofence/geofence.service.js';
import { SignalLossSweeper } from '../../src/geofence/signal-loss.sweeper.js';
import type { LocationLanes } from '../../src/queue/location-lanes.js';
import { connect, SQUARE_WKT } from './db-helpers.js';

/** SIGNAL_LOSS_TIMEOUT_MS = 30 sn (varsayılan). */
const TIMEOUT = "interval '30 seconds'";

/**
 * Sinyal kaybı: uzun süre konumu gelmeyen kullanıcının açık girişleri kapatılır. Sessizlik
 * sunucunun konumu işlediği ana (seen_at) göre ölçülür. Kapanan kayıt exit_reason =
 * SIGNAL_LOST ile işaretlenir (testte signal_lost olarak okunur).
 */
describe('Sinyal kaybı araması', () => {
  let ds: DataSource;
  let sweeper: SignalLossSweeper;
  let areaId: string;
  /** Kuyrukta bekleyen en eski işin yaşı (ms). */
  let pendingMs = 0;

  /** Kullanıcının son konumu ve açık girişi; `seen` ve `recorded` şimdiden ne kadar önce. */
  const user = async (
    userId: string,
    seen: string,
    recorded = seen,
    visits = [{ exit: null as string | null }],
  ) => {
    await ds.query(
      `INSERT INTO user_last_location (user_id, lat, lng, recorded_at, seen_at)
       VALUES ($1, 40.985, 29.025, now() - $2::interval, now() - $3::interval)`,
      [userId, recorded, seen],
    );
    for (const v of visits) {
      await ds.query(
        `INSERT INTO area_logs (user_id, area_id, entry_time, exit_time)
         VALUES ($1, $2, now() - $3::interval - interval '10 minutes', $4)`,
        [userId, areaId, recorded, v.exit],
      );
    }
  };
  const visits = (userId: string) =>
    ds.query(
      `SELECT exit_time, (exit_reason IS NOT DISTINCT FROM 'SIGNAL_LOST') AS signal_lost,
              (exit_time > now() - interval '1 minute') AS closed_now
         FROM area_logs WHERE user_id = $1 ORDER BY id`,
      [userId],
    );

  beforeAll(async () => {
    ds = await connect();
    const base = loadConfig();
    const lanes = { oldestPendingAgeMs: async () => pendingMs };
    sweeper = new SignalLossSweeper(
      ds,
      new GeofenceRepository(),
      lanes as unknown as LocationLanes,
      { ...base, worker: { ...base.worker, signalLossTimeoutMs: 30_000 } },
    );
  });
  beforeEach(async () => {
    pendingMs = 0;
    await ds.query(
      'TRUNCATE area_logs, user_last_location, areas RESTART IDENTITY CASCADE',
    );
    [{ id: areaId }] = await ds.query(
      `INSERT INTO areas (name, type, geom) VALUES ('Park', 'PARKING', ST_GeomFromText($1, 4326)) RETURNING id`,
      [SQUARE_WKT],
    );
  });
  afterAll(() => ds.destroy());

  it('30 sn sessiz kalan kullanıcının açık girişi kapatıldığı anla kapanır; diğerlerine dokunulmaz', async () => {
    await user('sessiz', '31 seconds');
    await user('yeni', '25 seconds');
    // Cihaz saati 2 saat geride ama konum az önce işlendi: sessiz değil.
    await user('saati-geri', '5 seconds', '2 hours');
    await user('kapanmis', '3 hours', '3 hours', [
      { exit: new Date(Date.now() - 3 * 3_600_000).toISOString() },
    ]);

    expect(await sweeper.sweep()).toBe(1);
    expect(await visits('sessiz')).toEqual([
      {
        exit_time: expect.any(Date),
        signal_lost: true,
        closed_now: true,
      },
    ]);
    for (const other of ['yeni', 'saati-geri'])
      expect(await visits(other)).toEqual([
        { exit_time: null, signal_lost: false, closed_now: null },
      ]);
    expect(await visits('kapanmis')).toEqual([
      expect.objectContaining({ signal_lost: false }),
    ]);
    // Tekrar çalışınca kapatacak bir şey kalmaz.
    expect(await sweeper.sweep()).toBe(0);
  });

  it('konumu kuyrukta bekleyen kullanıcı sessiz sayılmaz (en eski bekleyen işin yaşı kadar pay)', async () => {
    await user('kuyrukta', '40 seconds');
    // Yük altında konumlar 20 sn'dir kuyrukta: 30 + 20 = 50 sn'den kısa sessizlik kapanmaz.
    pendingMs = 20_000;
    expect(await sweeper.sweep()).toBe(0);
    pendingMs = 0;
    expect(await sweeper.sweep()).toBe(1);
  });

  it('giriş zamanı (cihaz saati) ileride olsa da çıkış girişten önce yazılmaz', async () => {
    await user('ileri-saat', '40 seconds');
    await ds.query(
      `UPDATE area_logs SET entry_time = now() + interval '50 seconds' WHERE user_id = 'ileri-saat'`,
    );
    expect(await sweeper.sweep()).toBe(1);
    const [{ ok }] = await ds.query(
      `SELECT exit_time = entry_time AS ok FROM area_logs WHERE user_id = 'ileri-saat'`,
    );
    expect(ok).toBe(true);
  });

  it('tam o sırada işlenen konum girişi kapattırmaz (kullanıcı kilidi)', async () => {
    await user('yarış', '31 seconds');
    // Konum işleme sürüyor: kullanıcı kilidi alınmış, konum henüz commit edilmedi.
    const processing = ds.createQueryRunner();
    await processing.connect();
    await processing.startTransaction();
    await new GeofenceRepository().lockUser(processing.manager, 'yarış');

    const sweep = sweeper.sweep();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await processing.query(
      `UPDATE user_last_location SET seen_at = now(), recorded_at = now() WHERE user_id = 'yarış'`,
    );
    await processing.commitTransaction();
    await processing.release();

    expect(await sweep).toBe(0);
    expect(await visits('yarış')).toEqual([
      expect.objectContaining({ exit_time: null, signal_lost: false }),
    ]);
  });

  it('500 kullanıcılık gruplar hâlinde hepsini kapatır', async () => {
    await ds.query(
      `INSERT INTO user_last_location (user_id, lat, lng, recorded_at, seen_at)
       SELECT 'u' || i, 40.985, 29.025, now() - ${TIMEOUT} * 2, now() - ${TIMEOUT} * 2
         FROM generate_series(1, 1200) i`,
    );
    await ds.query(
      `INSERT INTO area_logs (user_id, area_id, entry_time)
       SELECT 'u' || i, $1, now() - ${TIMEOUT} * 3 FROM generate_series(1, 1200) i`,
      [areaId],
    );
    expect(await sweeper.sweep()).toBe(1200);
    const [{ open }] = await ds.query(
      `SELECT count(*)::int AS open FROM area_logs WHERE exit_time IS NULL`,
    );
    expect(open).toBe(0);
  });

  it('sinyali kesilen kullanıcı aynı alanda yeniden görülünce yeni giriş açılır', async () => {
    const geofence = new GeofenceService(ds, new GeofenceRepository());
    await user('geri-geldi', '40 seconds');
    await sweeper.sweep();
    await geofence.process({
      userId: 'geri-geldi',
      lat: 40.985,
      lng: 29.025,
      recordedAt: new Date().toISOString(),
    });
    expect(
      (await visits('geri-geldi')).map(
        (v: { signal_lost: boolean; exit_time: Date | null }) => [
          v.signal_lost,
          v.exit_time === null,
        ],
      ),
    ).toEqual([
      [true, false],
      [false, true],
    ]);
  });

  it('konum işlenince sunucu zamanı (seen_at) güncellenir', async () => {
    const geofence = new GeofenceService(ds, new GeofenceRepository());
    await user('işlenen', '2 hours');
    await geofence.process({
      userId: 'işlenen',
      lat: 40.985,
      lng: 29.025,
      recordedAt: new Date().toISOString(),
    });
    const [{ fresh }] = await ds.query(
      `SELECT seen_at > now() - interval '1 minute' AS fresh FROM user_last_location WHERE user_id = 'işlenen'`,
    );
    expect(fresh).toBe(true);
  });
});
