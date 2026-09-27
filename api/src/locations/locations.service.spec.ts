import { BadRequestException } from '@nestjs/common';
import type { LocationLanes } from '../queue/location-lanes.js';
import type { UserRateLimiter } from '../security/user-rate-limiter.js';
import { LocationsService } from './locations.service.js';
import type { QueueBackpressure } from './queue-backpressure.js';

describe('LocationsService', () => {
  const now = new Date('2026-09-25T10:00:00.000Z');
  const ts = '2026-09-25T09:59:00.000Z';
  let add: ReturnType<typeof vi.fn>;
  let addMany: ReturnType<typeof vi.fn>;
  let consume: ReturnType<typeof vi.fn>;
  let assertCapacity: ReturnType<typeof vi.fn>;
  let service: LocationsService;

  beforeEach(() => {
    add = vi.fn().mockResolvedValue('5:7');
    addMany = vi
      .fn()
      .mockImplementation(async (jobs: unknown[]) =>
        jobs.map((_, i) => `5:${i + 1}`),
      );
    consume = vi.fn().mockResolvedValue(undefined);
    assertCapacity = vi.fn();
    service = new LocationsService(
      { add, addMany } as unknown as LocationLanes,
      { consume } as unknown as UserRateLimiter,
      { assertCapacity } as unknown as QueueBackpressure,
    );
  });

  describe('enqueue', () => {
    it('konumu istemcinin timestamp’iyle (UTC) ve istek kimliğiyle kuyruğa atar', async () => {
      const result = await service.enqueue(
        { userId: 'u', lat: 1, lng: 2, timestamp: '2026-09-25T09:59:00+03:00' },
        'req-1',
        now,
      );
      expect(result).toEqual({
        jobId: '5:7',
        recordedAt: '2026-09-25T06:59:00.000Z',
      });
      expect(add).toHaveBeenCalledWith({
        userId: 'u',
        points: [{ lat: 1, lng: 2, recordedAt: '2026-09-25T06:59:00.000Z' }],
        requestId: 'req-1',
      });
      expect(consume).toHaveBeenCalledWith(new Map([['u', 1]]));
    });

    it('saat farkı payı içindeki timestamp’i kabul eder', async () => {
      await expect(
        service.enqueue(
          {
            userId: 'u',
            lat: 1,
            lng: 2,
            timestamp: '2026-09-25T10:00:30.000Z',
          },
          undefined,
          now,
        ),
      ).resolves.toBeDefined();
    });

    it('gelecekteki timestamp’i sınır kontrolünden önce reddeder', async () => {
      await expect(
        service.enqueue(
          {
            userId: 'u',
            lat: 1,
            lng: 2,
            timestamp: '2026-09-25T10:05:00.000Z',
          },
          undefined,
          now,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(consume).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
    });

    it('kuyruk doluysa rate limit sayacını harcamadan reddeder', async () => {
      assertCapacity.mockImplementation(() => {
        throw new Error('dolu');
      });
      await expect(
        service.enqueue(
          { userId: 'u', lat: 1, lng: 2, timestamp: ts },
          undefined,
          now,
        ),
      ).rejects.toThrow('dolu');
      expect(consume).not.toHaveBeenCalled();
    });

    it('rate limit reddinde kuyruğa eklemez', async () => {
      consume.mockRejectedValue(new Error('429'));
      await expect(
        service.enqueue(
          { userId: 'u', lat: 1, lng: 2, timestamp: ts },
          undefined,
          now,
        ),
      ).rejects.toThrow('429');
      expect(add).not.toHaveBeenCalled();
    });
  });

  describe('enqueueBatch', () => {
    it('kullanıcı başına tek iş oluşturur, noktaları zamana göre sıralar', async () => {
      const result = await service.enqueueBatch(
        [
          {
            userId: 'a',
            lat: 3,
            lng: 3,
            timestamp: '2026-09-25T09:59:10.000Z',
          },
          { userId: 'b', lat: 2, lng: 2, timestamp: ts },
          { userId: 'a', lat: 1, lng: 1, timestamp: ts },
        ],
        'req-2',
        now,
      );
      expect(result).toEqual({ accepted: 3, jobIds: ['5:1', '5:2'] });
      expect(addMany).toHaveBeenCalledTimes(1);
      expect(addMany.mock.calls[0][0]).toEqual([
        {
          userId: 'a',
          requestId: 'req-2',
          points: [
            { lat: 1, lng: 1, recordedAt: ts },
            { lat: 3, lng: 3, recordedAt: '2026-09-25T09:59:10.000Z' },
          ],
        },
        {
          userId: 'b',
          requestId: 'req-2',
          points: [{ lat: 2, lng: 2, recordedAt: ts }],
        },
      ]);
      expect(assertCapacity).toHaveBeenCalledWith(2);
      expect(consume).toHaveBeenCalledWith(
        new Map([
          ['a', 2],
          ['b', 1],
        ]),
      );
    });

    it('bir konum geçersizse hiçbirini eklemez ve hangisi olduğunu söyler', async () => {
      await expect(
        service.enqueueBatch(
          [
            { userId: 'a', lat: 1, lng: 1, timestamp: ts },
            { userId: 'a', lat: 1, lng: 1, timestamp: '2027-01-01T00:00:00Z' },
          ],
          undefined,
          now,
        ),
      ).rejects.toThrow('locations.1.timestamp');
      expect(addMany).not.toHaveBeenCalled();
    });
  });
});
