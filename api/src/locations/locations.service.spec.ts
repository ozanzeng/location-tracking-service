import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import type { RentalsService } from '../fleet/rentals.service.js';
import type { ScooterRegistry } from '../fleet/scooter-registry.js';
import type { Mock } from 'vitest';
import type { LocationLanes } from '../queue/location-lanes.js';
import { PrincipalKind } from '../security/principal-kind.enum.js';
import {
  type RiderPrincipal,
  SERVICE_PRINCIPAL,
} from '../security/principal.js';
import type { UserRateLimiter } from '../security/user-rate-limiter.js';
import { LocationsService } from './locations.service.js';
import type { QueueBackpressure } from './queue-backpressure.js';

describe('LocationsService', () => {
  const now = new Date('2026-09-25T10:00:00.000Z');
  const ts = '2026-09-25T09:59:00.000Z';
  // Tipli mock'lar: bağımlılıkların imzası değişirse typecheck burada da kırılır.
  let add: Mock<LocationLanes['add']>;
  let addMany: Mock<LocationLanes['addMany']>;
  let consume: Mock<UserRateLimiter['consume']>;
  let assertCapacity: Mock<QueueBackpressure['assertCapacity']>;
  let assertRegistered: Mock<ScooterRegistry['assertRegistered']>;
  let activeScooter: Mock<RentalsService['activeScooter']>;
  let service: LocationsService;

  beforeEach(() => {
    add = vi.fn<LocationLanes['add']>().mockResolvedValue('5:7');
    addMany = vi
      .fn<LocationLanes['addMany']>()
      .mockImplementation(async (jobs) => jobs.map((_, i) => `5:${i + 1}`));
    consume = vi.fn<UserRateLimiter['consume']>().mockResolvedValue(undefined);
    assertCapacity = vi.fn<QueueBackpressure['assertCapacity']>();
    assertRegistered = vi.fn<ScooterRegistry['assertRegistered']>();
    activeScooter = vi
      .fn<RentalsService['activeScooter']>()
      .mockResolvedValue(null);
    service = new LocationsService(
      { add, addMany } as unknown as LocationLanes,
      { consume } as unknown as UserRateLimiter,
      { assertCapacity } as unknown as QueueBackpressure,
      { assertRegistered } as unknown as ScooterRegistry,
      { activeScooter } as unknown as RentalsService,
    );
  });

  describe('enqueue', () => {
    it('konumu istemcinin timestamp’iyle (UTC) ve istek kimliğiyle kuyruğa atar', async () => {
      const result = await service.enqueue(
        { userId: 'u', lat: 1, lng: 2, timestamp: '2026-09-25T09:59:00+03:00' },
        SERVICE_PRINCIPAL,
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
          SERVICE_PRINCIPAL,
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
          SERVICE_PRINCIPAL,
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
          SERVICE_PRINCIPAL,
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
          SERVICE_PRINCIPAL,
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
        SERVICE_PRINCIPAL,
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
          SERVICE_PRINCIPAL,
          undefined,
          now,
        ),
      ).rejects.toThrow('locations.1.timestamp');
      expect(addMany).not.toHaveBeenCalled();
    });
  });

  describe('gönderen', () => {
    const rider: RiderPrincipal = {
      kind: PrincipalKind.RIDER,
      riderId: 'r1',
      username: 'ali',
    };
    const at = (userId: string) => ({ userId, lat: 1, lng: 2, timestamp: ts });

    it('API anahtarı: kayıtlı olmayan scooter reddedilir, sayaç harcanmaz', async () => {
      assertRegistered.mockImplementation(() => {
        throw new BadRequestException('Kayıtlı olmayan scooter: x');
      });
      await expect(
        service.enqueue(at('x'), SERVICE_PRINCIPAL, undefined, now),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(consume).not.toHaveBeenCalled();
      expect(add).not.toHaveBeenCalled();
    });

    it('API anahtarı: toplu istekteki her scooter kontrol edilir; kiralama aranmaz', async () => {
      await service.enqueueBatch(
        [at('a'), at('b')],
        SERVICE_PRINCIPAL,
        undefined,
        now,
      );
      expect(assertRegistered).toHaveBeenCalledWith(['a', 'b']);
      expect(activeScooter).not.toHaveBeenCalled();
    });

    it('sürücü: kiraladığı scooter için kabul edilir', async () => {
      activeScooter.mockResolvedValue('scooter-01');
      await expect(
        service.enqueue(at('scooter-01'), rider, undefined, now),
      ).resolves.toBeDefined();
      expect(activeScooter).toHaveBeenCalledWith('r1');
    });

    it('sürücü: aktif kiralama yoksa 409', async () => {
      await expect(
        service.enqueue(at('scooter-01'), rider, undefined, now),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(add).not.toHaveBeenCalled();
    });

    it('sürücü: başka bir scooter adına gönderemez (toplu istekte tek biri bile)', async () => {
      activeScooter.mockResolvedValue('scooter-01');
      await expect(
        service.enqueueBatch(
          [at('scooter-01'), at('scooter-02')],
          rider,
          undefined,
          now,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(consume).not.toHaveBeenCalled();
      expect(addMany).not.toHaveBeenCalled();
    });
  });
});
