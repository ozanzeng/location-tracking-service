-- Bench veritabanı için gerçekçi hacimde veri: 3M kapanmış giriş (180 gün), ~17k açık giriş,
-- 50k kullanıcının son konumu. Alanlar geliştirme veritabanından kopyalanmış olmalı.
CREATE TEMP TABLE ids AS SELECT array_agg(id) AS a FROM areas WHERE name <> 'smoke-test-area';

INSERT INTO area_logs (user_id, area_id, entry_time, exit_time)
SELECT 'u' || (random() * 50000)::int,
       (SELECT a[1 + (random() * (array_length(a, 1) - 1))::int] FROM ids),
       t, t + (interval '1 minute' * (1 + random() * 30))
  FROM (SELECT now() - random() * interval '180 days' AS t FROM generate_series(1, 3000000)) s;

INSERT INTO area_logs (user_id, area_id, entry_time)
SELECT DISTINCT ON (u, aid) u, aid, now() - random() * interval '30 minutes'
  FROM (SELECT 'u' || (random() * 50000)::int AS u,
               (SELECT a[1 + (random() * (array_length(a, 1) - 1))::int] FROM ids) AS aid
          FROM generate_series(1, 21000)) s
ON CONFLICT DO NOTHING;

INSERT INTO user_last_location (user_id, lat, lng, recorded_at)
SELECT 'u' || i, 40.96 + random() * 0.04, 29.02 + random() * 0.05, now() - random() * interval '2 hours'
  FROM generate_series(0, 50000) i;

VACUUM ANALYZE;
