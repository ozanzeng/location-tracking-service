#!/usr/bin/env bash
# k6'yı compose ağında çalıştırır, ardından kuyruğun ne zaman boşaldığını ölçer.
# Kullanım: PEAK_RPS=2000 WORKERS=2 ./loadtest/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."

WORKERS="${WORKERS:-2}"
PEAK_RPS="${PEAK_RPS:-2000}"
mkdir -p loadtest/results

docker compose up -d --scale worker="$WORKERS" api worker >/dev/null
sleep 2

queue_backlog() {
  curl -s localhost:3000/health | python3 -c 'import json,sys; q=json.load(sys.stdin)["queue"]; print(q["waiting"]+q["active"]+q["delayed"])'
}

start=$(date +%s)
docker compose --profile loadtest run --rm -e PEAK_RPS="$PEAK_RPS" k6 \
  run --summary-export=/results/summary.json /scripts/locations.k6.js || true
ingest_end=$(date +%s)

echo "k6 bitti, kuyruk bekleniyor (backlog: $(queue_backlog))"
while [ "$(queue_backlog)" -gt 0 ]; do sleep 0.5; done
drained=$(date +%s)

accepted=$(python3 -c 'import json; m=json.load(open("loadtest/results/summary.json"))["metrics"]; print(int(m["checks"]["passes"]))')
echo
echo "Worker sayısı       : $WORKERS"
echo "Kabul edilen konum  : $accepted"
echo "Yük süresi          : $((ingest_end - start)) sn"
echo "Kuyruk boşalma      : $((drained - ingest_end)) sn (yük bittikten sonra)"
echo "İşleme hızı (ort.)  : $((accepted / (drained - start))) konum/sn"
