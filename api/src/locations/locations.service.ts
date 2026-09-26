import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { locationsAccepted } from '../metrics/metrics.js';
import {
  LOCATION_JOB,
  LOCATION_QUEUE,
  type LocationJobData,
} from '../queue/location-job.js';
import { UserRateLimiter } from '../security/user-rate-limiter.js';
import type { CreateLocationDto } from './dto/create-location.dto.js';
import { buildLocationJobs, FutureTimestampError } from './location-jobs.js';
import { QueueBackpressure } from './queue-backpressure.js';

/**
 * Yazma tarafı: konumları doğrular, kapasite ve kullanıcı sınırını kontrol eder, kuyruğa atar.
 * Sıra önemli: önce ucuz kontroller (doğrulama, bellekteki kuyruk derinliği), sonra
 * Redis'e giden rate limit; reddedilen istek sayaç harcamaz.
 */
@Injectable()
export class LocationsService {
  constructor(
    @InjectQueue(LOCATION_QUEUE)
    private readonly queue: Queue<LocationJobData>,
    private readonly rateLimiter: UserRateLimiter,
    private readonly backpressure: QueueBackpressure,
  ) {}

  async enqueue(
    dto: CreateLocationDto,
    requestId?: string,
    now = new Date(),
  ): Promise<{ jobId: string; recordedAt: string }> {
    const [job] = this.build([dto], requestId, now);
    this.backpressure.assertCapacity(1);
    await this.rateLimiter.consume(new Map([[dto.userId, 1]]));

    const added = await this.queue.add(LOCATION_JOB, job);
    locationsAccepted.inc();
    return { jobId: added.id!, recordedAt: job.points[0].recordedAt };
  }

  /** Toplu ekleme: kullanıcı başına tek iş, hepsi tek Redis çağrısıyla kuyruğa girer. */
  async enqueueBatch(
    dtos: CreateLocationDto[],
    requestId?: string,
    now = new Date(),
  ): Promise<{ accepted: number; jobIds: string[] }> {
    const jobs = this.build(dtos, requestId, now);
    this.backpressure.assertCapacity(jobs.length);
    await this.rateLimiter.consume(
      new Map(jobs.map((job) => [job.userId, job.points.length])),
    );

    const added = await this.queue.addBulk(
      jobs.map((data) => ({ name: LOCATION_JOB, data })),
    );
    locationsAccepted.inc(dtos.length);
    return { accepted: dtos.length, jobIds: added.map((j) => j.id!) };
  }

  private build(
    dtos: CreateLocationDto[],
    requestId: string | undefined,
    now: Date,
  ): LocationJobData[] {
    try {
      return buildLocationJobs(dtos, requestId, now);
    } catch (err) {
      if (err instanceof FutureTimestampError) {
        throw new BadRequestException(
          dtos.length > 1
            ? `locations.${err.index}.${err.message}`
            : err.message,
        );
      }
      throw err;
    }
  }
}
