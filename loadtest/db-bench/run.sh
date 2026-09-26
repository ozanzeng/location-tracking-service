#!/usr/bin/env bash
# Veritabanı bench'i: ayrı bir veritabanında 3M kayıt üretir ve worker'ın konum başına
# transaction'ını pgbench ile ölçer. Geliştirme verisine dokunmaz.
# Kullanım: ./loadtest/db-bench/run.sh   (docker compose ayakta olmalı)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=geofence_bench
psql() { docker compose exec -T postgres psql -U geofence "$@"; }

psql -d postgres -qc "DROP DATABASE IF EXISTS $DB" -qc "CREATE DATABASE $DB OWNER geofence"
(cd api && DB_NAME=$DB node dist/database/migrate.js)
docker compose exec -T postgres sh -c "pg_dump -U geofence -d geofence -t areas --data-only | psql -q -U geofence -d $DB"
echo "Veri üretiliyor (yaklaşık 1 dakika)..."
psql -d $DB -q < loadtest/db-bench/generate.sql

for f in worker-tx.sql worker-tx-hybrid.sql; do
  docker compose cp "loadtest/db-bench/$f" "postgres:/tmp/$f" >/dev/null 2>&1
done
bench() {
  docker compose exec -T -e PGOPTIONS="-c synchronous_commit=$1" postgres \
    pgbench -U geofence -n -c 8 -j 2 -T 30 -f "/tmp/$2" $DB 2>&1 | grep -E '^tps' | sed "s/^/$3: /"
}
bench on worker-tx.sql "tamamen dayanıklı"
bench on worker-tx-hybrid.sql "karma (uygulamadaki)"
bench off worker-tx.sql "tamamen kapalı"
psql -d $DB -Atc "SELECT 'user_last_location HOT oranı: %' || round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) FROM pg_stat_user_tables WHERE relname = 'user_last_location'"
echo "Bitince: docker compose exec postgres psql -U geofence -d postgres -c 'DROP DATABASE $DB'"
