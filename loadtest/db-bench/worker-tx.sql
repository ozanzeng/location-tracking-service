\set uid random(1, 50000)
\set lat random(40960000, 41000000)
\set lng random(29020000, 29070000)
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('u' || :uid, 0));
SELECT (SELECT recorded_at FROM user_last_location WHERE user_id = 'u' || :uid) AS last_recorded_at,
  COALESCE((SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type)) FROM areas a WHERE ST_Contains(a.geom, ST_SetSRID(ST_MakePoint(:lng / 1000000.0, :lat / 1000000.0), 4326))), '[]'::json) AS inside,
  COALESCE((SELECT json_agg(json_build_object('id', a.id, 'name', a.name, 'type', a.type)) FROM area_logs l JOIN areas a ON a.id = l.area_id WHERE l.user_id = 'u' || :uid AND l.exit_time IS NULL), '[]'::json) AS present;
WITH upsert_location AS (
  INSERT INTO user_last_location (user_id, lat, lng, recorded_at) VALUES ('u' || :uid, :lat / 1000000.0, :lng / 1000000.0, now())
  ON CONFLICT (user_id) DO UPDATE SET lat = EXCLUDED.lat, lng = EXCLUDED.lng, recorded_at = EXCLUDED.recorded_at
), closed AS (
  UPDATE area_logs SET exit_time = now() WHERE user_id = 'u' || :uid AND exit_time IS NULL AND area_id = ANY('{}'::uuid[]) RETURNING id
), opened AS (
  INSERT INTO area_logs (user_id, area_id, entry_time) SELECT 'u' || :uid, unnest('{}'::uuid[]), now()
  ON CONFLICT (user_id, area_id) WHERE exit_time IS NULL DO NOTHING RETURNING id
) SELECT 1;
COMMIT;
