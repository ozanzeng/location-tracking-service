import { buildLocationJobs, FutureTimestampError } from './location-jobs.js';

const now = new Date('2026-09-25T10:00:00.000Z');
const at = (s: string) => `2026-09-25T09:${s}.000Z`;

describe('buildLocationJobs', () => {
  it('kullanıcı başına tek iş oluşturur ve noktaları zamana göre sıralar', () => {
    const jobs = buildLocationJobs(
      [
        { userId: 'a', lat: 3, lng: 3, timestamp: at('59:10') },
        { userId: 'b', lat: 2, lng: 2, timestamp: at('59:00') },
        { userId: 'a', lat: 1, lng: 1, timestamp: at('59:00') },
      ],
      'req-1',
      now,
    );
    expect(jobs).toEqual([
      {
        userId: 'a',
        requestId: 'req-1',
        points: [
          { lat: 1, lng: 1, recordedAt: at('59:00') },
          { lat: 3, lng: 3, recordedAt: at('59:10') },
        ],
      },
      {
        userId: 'b',
        requestId: 'req-1',
        points: [{ lat: 2, lng: 2, recordedAt: at('59:00') }],
      },
    ]);
  });

  it('zamanı UTC ISO biçimine çevirir', () => {
    const [job] = buildLocationJobs(
      [{ userId: 'u', lat: 0, lng: 0, timestamp: '2026-09-25T12:59:00+03:00' }],
      undefined,
      now,
    );
    expect(job.points[0].recordedAt).toBe('2026-09-25T09:59:00.000Z');
  });

  it('60 sn payı içindeki ileri saati kabul eder, fazlasını hangi konum olduğunu söyleyerek reddeder', () => {
    expect(() =>
      buildLocationJobs(
        [
          {
            userId: 'u',
            lat: 0,
            lng: 0,
            timestamp: '2026-09-25T10:00:59.000Z',
          },
        ],
        undefined,
        now,
      ),
    ).not.toThrow();

    try {
      buildLocationJobs(
        [
          { userId: 'u', lat: 0, lng: 0, timestamp: at('59:00') },
          {
            userId: 'u',
            lat: 0,
            lng: 0,
            timestamp: '2026-09-25T10:02:00.000Z',
          },
        ],
        undefined,
        now,
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(FutureTimestampError);
      expect((err as FutureTimestampError).index).toBe(1);
    }
  });
});
