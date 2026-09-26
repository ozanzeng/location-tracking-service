import { BadRequestException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import { LOCATION_JOB, type LocationJobData } from '../queue/location-job.js';
import { LocationsService } from './locations.service.js';

describe('LocationsService.enqueue', () => {
  const now = new Date('2026-09-25T10:00:00.000Z');
  let add: ReturnType<typeof vi.fn>;
  let service: LocationsService;

  beforeEach(() => {
    add = vi.fn().mockResolvedValue({ id: '7' });
    service = new LocationsService(
      { add } as unknown as Queue<LocationJobData>,
      {} as DataSource,
    );
  });

  it('konumu istemcinin timestamp’iyle (UTC) kuyruğa atar', async () => {
    const result = await service.enqueue(
      { userId: 'u', lat: 1, lng: 2, timestamp: '2026-09-25T09:59:00+03:00' },
      now,
    );
    expect(result).toEqual({
      jobId: '7',
      recordedAt: '2026-09-25T06:59:00.000Z',
    });
    expect(add).toHaveBeenCalledWith(LOCATION_JOB, {
      userId: 'u',
      lat: 1,
      lng: 2,
      recordedAt: '2026-09-25T06:59:00.000Z',
    });
  });

  it('saat farkı payı içindeki timestamp’i kabul eder', async () => {
    await expect(
      service.enqueue(
        { userId: 'u', lat: 1, lng: 2, timestamp: '2026-09-25T10:00:30.000Z' },
        now,
      ),
    ).resolves.toBeDefined();
  });

  it('gelecekteki timestamp’i reddeder', async () => {
    await expect(
      service.enqueue(
        { userId: 'u', lat: 1, lng: 2, timestamp: '2026-09-25T10:05:00.000Z' },
        now,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(add).not.toHaveBeenCalled();
  });
});
