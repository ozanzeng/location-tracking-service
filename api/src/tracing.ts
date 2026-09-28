/**
 * OpenTelemetry dağıtık izleme. Sürecin en başında yüklenir (node --import ./dist/tracing.js):
 * pg, ioredis, http ve express modülleri uygulama onları yüklemeden önce yamalanmalı.
 *
 * Sadece OTEL_EXPORTER_OTLP_ENDPOINT verilirse açılır; verilmezse hiçbir şey yüklenmez, maliyet
 * yok. Ayarlar OpenTelemetry'nin standart ortam değişkenleriyle yapılır: OTEL_SERVICE_NAME,
 * OTEL_TRACES_SAMPLER / OTEL_TRACES_SAMPLER_ARG (örnekleme; yük altında hepsi kaydedilmesin),
 * OTEL_SDK_DISABLED.
 *
 * Bir konumun izi API'deki HTTP isteğinden başlar, kuyruktan worker'a taşınır (iş verisindeki
 * trace bağlamı; common/tracing/trace-context.ts) ve worker'daki veritabanı sorgularıyla biter.
 */
import { register } from 'node:module';

if (
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
  process.env.OTEL_SDK_DISABLED !== 'true'
) {
  // ESM uygulamada modül yamalamak için yükleme kancası (import-in-the-middle).
  register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
  const [
    { NodeSDK },
    { OTLPTraceExporter },
    { HttpInstrumentation },
    { ExpressInstrumentation },
    { NestInstrumentation },
    { PgInstrumentation },
    { IORedisInstrumentation },
  ] = await Promise.all([
    import('@opentelemetry/sdk-node'),
    import('@opentelemetry/exporter-trace-otlp-proto'),
    import('@opentelemetry/instrumentation-http'),
    import('@opentelemetry/instrumentation-express'),
    import('@opentelemetry/instrumentation-nestjs-core'),
    import('@opentelemetry/instrumentation-pg'),
    import('@opentelemetry/instrumentation-ioredis'),
  ]);
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [
      new HttpInstrumentation({
        // Sağlık kontrolü ve metrik kazıma izleri gürültü.
        ignoreIncomingRequestHook: (req) =>
          /^\/(health|metrics)/.test(req.url ?? ''),
      }),
      new ExpressInstrumentation(),
      new NestInstrumentation(),
      // Sorgu metni izde görünür, parametreler (konum, şifre özeti) görünmez.
      new PgInstrumentation({ enhancedDatabaseReporting: false }),
      new IORedisInstrumentation(),
    ],
  });
  sdk.start();
  // Kapanışta bekleyen izler gönderilsin.
  process.once('beforeExit', () => void sdk.shutdown());
  process.once('SIGTERM', () => void sdk.shutdown());
}
