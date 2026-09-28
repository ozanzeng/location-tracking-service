import {
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
  register,
} from 'prom-client';

// Metrikler süreç başına tektir; API ve worker aynı tanımları kendi süreçlerinde kullanır.
let defaultsCollected = false;
export function collectProcessMetrics(): void {
  if (defaultsCollected) return;
  collectDefaultMetrics();
  defaultsCollected = true;
}

export const metricsRegistry = register;

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP istek süresi',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
});

export const locationsAccepted = new Counter({
  name: 'locations_accepted_total',
  help: 'Kuyruğa alınan konum sayısı',
});

export const locationsRejected = new Counter({
  name: 'locations_rejected_total',
  help: 'Reddedilen konum sayısı',
  labelNames: ['reason'] as const,
});

export const queueBacklog = new Gauge({
  name: 'location_queue_backlog',
  help: 'Kuyrukta işlenmeyi bekleyen iş sayısı, tüm şeritlerin toplamı (API son okuma)',
});

export const laneBacklogMax = new Gauge({
  name: 'location_lane_backlog_max',
  help: 'En dolu şeritte bekleyen iş sayısı; diğerlerinden çok yüksekse o şeritte yavaş bir iş vardır',
});

export const jobDuration = new Histogram({
  name: 'location_job_duration_seconds',
  help: 'Bir konumun worker tarafından işlenme süresi',
  labelNames: ['result'] as const,
  buckets: [0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 1],
});

export const jobLag = new Histogram({
  name: 'location_job_lag_seconds',
  help: 'Konumun kuyruğa alınmasından işlenmeye başlanmasına kadar geçen süre',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 15, 60, 300],
});

export const areaTransitions = new Counter({
  name: 'area_transitions_total',
  help: 'Alan giriş ve çıkışları',
  labelNames: ['event'] as const,
});

export const signalLostVisits = new Counter({
  name: 'area_visits_signal_lost_total',
  help: 'Konumu uzun süre gelmediği için "sinyal kesildi" olarak kapatılan girişler',
});

export const jobFailures = new Counter({
  name: 'location_job_failures_total',
  help: 'Başarısız konum işleri (işin içindeki denemeler tükendikten sonra)',
});
