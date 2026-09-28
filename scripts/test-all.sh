#!/usr/bin/env bash
# Bütün testler: backend, frontend ve veritabanı için birim, e2e ve smoke.
# Kullanım: ./scripts/test-all.sh           (docker compose ayakta olmalı: docker compose up -d --build)
#           SKIP_UI=1 ./scripts/test-all.sh (tarayıcı testlerini atla)
# İlk hatada durmaz; sonda özet tablo basar, herhangi bir aşama başarısızsa 1 ile çıkar.
set -uo pipefail
cd "$(dirname "$0")/.."

declare -a NAMES RESULTS TIMES
failed=0

run() {
  local name="$1"; shift
  local start=$(date +%s)
  printf '\n\033[1m▶ %s\033[0m\n' "$name"
  if "$@"; then RESULTS+=("✓"); else RESULTS+=("✗"); failed=1; fi
  NAMES+=("$name"); TIMES+=("$(( $(date +%s) - start )) sn")
}
in_api() { (cd api && "$@"); }
in_clients() { (cd clients && "$@"); }

if ! docker compose ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx api; then
  echo "Stack ayakta değil: önce 'docker compose up -d --build' çalıştırın." >&2
  exit 1
fi

# Statik kontroller
run "Backend: lint + tip kontrolü"      in_api sh -c 'npm run lint --silent && npm run typecheck --silent'
run "Frontend: tip kontrolü"            in_clients npm run typecheck --silent
# Birim
run "Backend: birim"                    in_api npm test --silent
run "Frontend: birim"                   in_clients npm run test:unit --silent
run "Alarm kuralları (promtool)"       docker run --rm --entrypoint promtool -v "$PWD/docker/observability:/c" -w /c \
                                          prom/prometheus:v3.5.0 test rules alerts.test.yml
# Veritabanı ve e2e (gerçek PostGIS + Redis; ayrı test veritabanı)
run "Veritabanı: migration, kısıt, plan" in_api npm run test:db --silent
run "Backend: e2e"                      in_api npm run test:e2e --silent
# Smoke (çalışan stack'e karşı; veri yazmaz, backend smoke tek bir test kullanıcısı hariç)
run "Veritabanı: smoke"                 in_api sh -c 'npx nest build >/dev/null && npm run smoke:db --silent'
run "Backend: smoke"                    in_api npm run smoke --silent
run "Frontend: smoke"                   in_clients npm run smoke --silent
# Tarayıcıda iki uygulama arası e2e
if [ "${SKIP_UI:-0}" != "1" ]; then
  run "Frontend: tarayıcı e2e"          in_clients npm run test:ui --silent
  # Tarayıcı testlerinin geliştirme verisine bıraktıkları
  docker compose exec -T postgres psql -U geofence -d geofence -qc \
    "DELETE FROM areas WHERE name LIKE 'UI testi %'; DELETE FROM area_logs WHERE user_id LIKE 'ui-%'; DELETE FROM user_last_location WHERE user_id LIKE 'ui-%';
     DELETE FROM rentals WHERE scooter_id LIKE 'ui-%' OR rider_id IN (SELECT id FROM riders WHERE username LIKE 'ui-%');
     DELETE FROM riders WHERE username LIKE 'ui-%'; DELETE FROM scooters WHERE id LIKE 'ui-%';" >/dev/null
  docker compose exec -T redis sh -c \
    "redis-cli --scan --pattern 'geofence:device-log:ui-*' | xargs -r -n 500 redis-cli del >/dev/null"
fi

# Sonuç ve süre başta: Türkçe karakterler printf genişliğini bozduğu için ad en sonda.
printf '\n\033[1mSonuç   Süre   Aşama\033[0m\n'
for i in "${!NAMES[@]}"; do printf '%s   %6s   %s\n' "${RESULTS[$i]}" "${TIMES[$i]}" "${NAMES[$i]}"; done
exit $failed
