import {
  context,
  propagation,
  ROOT_CONTEXT,
  type Attributes,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import type { TraceCarrier } from './tracing.types.js';

const tracer = trace.getTracer('location-tracking-service');

/**
 * Şu anki isteğin trace bağlamı; izleme kapalıysa (tracing.ts yüklenmedi) undefined ve iş
 * verisi değişmez.
 */
export function currentTraceCarrier(): TraceCarrier | undefined {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return Object.keys(carrier).length > 0 ? carrier : undefined;
}

/**
 * Kuyruktan gelen işi, onu gönderen HTTP isteğinin izine bağlı bir span içinde çalıştırır:
 * worker'daki veritabanı ve Redis çağrıları aynı izde görünür. İzleme kapalıysa sadece fn.
 */
export function withJobSpan<T>(
  name: string,
  carrier: TraceCarrier | undefined,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = carrier
    ? propagation.extract(ROOT_CONTEXT, carrier)
    : ROOT_CONTEXT;
  return tracer.startActiveSpan(
    name,
    { kind: SpanKind.CONSUMER, attributes },
    parent,
    async (span) => {
      try {
        return await fn();
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
