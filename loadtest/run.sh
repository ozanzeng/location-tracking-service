#!/usr/bin/env bash
# k6'yı compose ağında çalıştırır, ardından kuyruğun ne zaman boşaldığını ölçer.
# Kullanım: PEAK_RPS=2000 WORKERS=2 ./loadtest/run.sh
#           KEEP_DATA=1 ./loadtest/run.sh             (test verisini silme; sonuçları incelemek için)
#           MOVE=teleport ./loadtest/run.sh        (en kötü durum; eski ölçümlerle karşılaştırma)
#           PROFILE=soak SOAK_RPS=500 SOAK_DURATION=30m ./loadtest/run.sh
#
# İki ayrı hız yazılır:
# - Worker hızı (boşalma): yük bittiğinde kuyrukta kalan işler / boşalma süresi. Worker'lar
#   o sırada doygun çalışır, bu yüzden kapasiteye en yakın sayı budur. k6 durduğu için CPU'yu
#   worker'lar paylaşır; yük sırasındaki hız bundan düşük olabilir.
# - Ortalama işleme: kabul edilen / toplam süre (ısınma ve boşalma dahil). Yük profiliyle
#   sınırlıdır (k6 kaç istek gönderebildiyse); kapasite değil, alt sınırdır. Isınma eklenmeden
#   önceki koşularla karşılaştırılamaz (README).
set -uo pipefail
cd "$(dirname "$0")/.."

WORKERS="${WORKERS:-2}"
PEAK_RPS="${PEAK_RPS:-2000}"
MOVE="${MOVE:-route}"
PROFILE="${PROFILE:-load}"
mkdir -p loadtest/results

docker compose up -d --scale worker="$WORKERS" api worker >/dev/null
sleep 2

queue_backlog() {
  curl -s localhost:3000/health | python3 -c 'import json,sys; q=json.load(sys.stdin)["queue"]; print(q["waiting"]+q["active"]+q["delayed"])'
}

# Yük sırasında saniyede bir kuyruk derinliği: en yüksek birikim yazılır.
samples=loadtest/results/backlog.txt
: > "$samples"
( while true; do queue_backlog >> "$samples" 2>/dev/null; sleep 1; done ) &
sampler=$!

start=$(date +%s)
docker compose --profile loadtest run --rm \
  -e PEAK_RPS="$PEAK_RPS" -e MOVE="$MOVE" -e PROFILE="$PROFILE" \
  -e SOAK_RPS="${SOAK_RPS:-500}" -e SOAK_DURATION="${SOAK_DURATION:-30m}" k6 \
  run --summary-export=/results/summary.json /scripts/locations.k6.js
rc=$?
ingest_end=$(date +%s)
kill "$sampler" 2>/dev/null
wait "$sampler" 2>/dev/null

backlog_at_end=$(queue_backlog)
echo "k6 bitti, kuyruk bekleniyor (backlog: $backlog_at_end)"
drain_start=$(python3 -c 'import time; print(time.time())')
while [ "$(queue_backlog)" -gt 0 ]; do sleep 0.5; done
drained=$(date +%s)
drain_seconds=$(python3 -c "import time; print(max(time.time() - $drain_start, 0.5))")

read -r accepted dropped <<<"$(python3 -c '
import json
m = json.load(open("loadtest/results/summary.json"))["metrics"]
print(int(m.get("accepted_locations", {}).get("count", 0)), int(m.get("dropped_iterations", {}).get("count", 0)))')"
peak_backlog=$(sort -n "$samples" | tail -1)

echo
echo "Profil / hareket       : $PROFILE / $MOVE"
echo "Worker sayısı          : $WORKERS"
echo "Kabul edilen konum     : $accepted"
echo "Düşen istek (k6)       : $dropped$([ "$dropped" -gt 0 ] && echo "  ← k6 hedef hıza ulaşamadı; koşular karşılaştırılamaz")"
echo "Yük süresi             : $((ingest_end - start)) sn"
echo "En yüksek birikim      : ${peak_backlog:-0} iş"
echo "Kuyruk boşalma         : $((drained - ingest_end)) sn (yük bittikten sonra, $backlog_at_end iş)"
if [ "$backlog_at_end" -gt 0 ]; then
  echo "Worker hızı (boşalma)  : $(python3 -c "print(round($backlog_at_end / $drain_seconds))") iş/sn"
else
  echo "Worker hızı (boşalma)  : ölçülemedi (yük bitince kuyruk boştu; worker'lar yüke yetişti)"
fi
echo "Ortalama işleme        : $((accepted / (drained - start))) konum/sn (alt sınır)"
# Test filosu (load-*) ve ürettiği kayıtlar geliştirme verisinde kalmasın; kuyruk boşaldı.
if [ "${KEEP_DATA:-0}" != "1" ]; then
  docker compose exec -T postgres psql -U geofence -d geofence -qc \
    "DELETE FROM area_logs WHERE user_id LIKE 'load-%'; DELETE FROM user_last_location WHERE user_id LIKE 'load-%';
     DELETE FROM rentals WHERE scooter_id LIKE 'load-%'; DELETE FROM scooters WHERE id LIKE 'load-%';" >/dev/null \
    && docker compose exec -T redis sh -c \
      "redis-cli --scan --pattern 'geofence:device-log:load-*' | xargs -r -n 500 redis-cli del >/dev/null" \
    && echo "Test verisi silindi     : load-* scooterlar, konumları, kayıtları ve cihaz günlükleri (KEEP_DATA=1 ile tutulur)"
fi
if [ "$rc" -eq 0 ]; then
  echo "k6 eşikleri            : geçti"
else
  echo "k6 eşikleri            : KALDI (çıkış kodu $rc)"
fi
exit "$rc"
