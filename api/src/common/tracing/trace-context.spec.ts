import { context, propagation, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { buildLocationJobs } from '../../locations/location-jobs.js';
import { currentTraceCarrier, withJobSpan } from './trace-context.js';

const point = {
  userId: 'scooter-01',
  lat: 40.985,
  lng: 29.025,
  timestamp: '2026-01-01T10:00:00Z',
};

describe('kuyruk üzerinden izleme bağlamı', () => {
  it('izleme kapalıyken iş verisine bağlam eklenmez', () => {
    expect(currentTraceCarrier()).toBeUndefined();
    const [job] = buildLocationJobs(
      [point],
      'r1',
      new Date('2026-01-01T10:00:01Z'),
    );
    expect(job).not.toHaveProperty('trace');
  });

  describe('izleme açıkken', () => {
    const exporter = new InMemorySpanExporter();
    beforeAll(() => {
      context.setGlobalContextManager(
        new AsyncLocalStorageContextManager().enable(),
      );
      propagation.setGlobalPropagator(new W3CTraceContextPropagator());
      trace.setGlobalTracerProvider(
        new BasicTracerProvider({
          spanProcessors: [new SimpleSpanProcessor(exporter)],
        }),
      );
    });
    afterAll(() => {
      trace.disable();
      propagation.disable();
      context.disable();
    });

    it('API isteğinin izi işe yazılır, worker span’i aynı izin çocuğu olur', async () => {
      const tracer = trace.getTracer('test');
      const request = tracer.startSpan('POST /locations');
      const [job] = context.with(trace.setSpan(context.active(), request), () =>
        buildLocationJobs([point], 'r1', new Date('2026-01-01T10:00:01Z')),
      );
      request.end();
      expect(job.trace?.traceparent).toContain(request.spanContext().traceId);

      // Worker: bağlam yok, sadece iş verisi var.
      await withJobSpan(
        'location.process',
        job.trace,
        { 'scooter.id': 'scooter-01' },
        async () => {
          // Burada açılan span'ler (veritabanı sorguları) da aynı izde olur.
          tracer.startSpan('SELECT').end();
        },
      );

      const spans = exporter.getFinishedSpans();
      const processSpan = spans.find((s) => s.name === 'location.process');
      const query = spans.find((s) => s.name === 'SELECT');
      expect(processSpan?.spanContext().traceId).toBe(
        request.spanContext().traceId,
      );
      expect(processSpan?.parentSpanContext?.spanId).toBe(
        request.spanContext().spanId,
      );
      expect(query?.parentSpanContext?.spanId).toBe(
        processSpan?.spanContext().spanId,
      );
    });

    it('hata span’e kaydedilir ve iş yine hata verir', async () => {
      await expect(
        withJobSpan('location.process', undefined, {}, async () => {
          throw new Error('veritabanı yok');
        }),
      ).rejects.toThrow('veritabanı yok');
      const failed = exporter.getFinishedSpans().at(-1);
      expect(failed?.status.code).toBe(2);
      expect(failed?.events[0]?.name).toBe('exception');
    });
  });
});
