import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RentalsService } from '../fleet/rentals.service.js';
import { ScooterRegistry } from '../fleet/scooter-registry.js';
import { locationsAccepted } from '../metrics/metrics.js';
import { LocationLanes } from '../queue/location-lanes.js';
import type { LocationJobData } from '../queue/location-job.js';
import { isRider, type Principal } from '../security/principal.js';
import { UserRateLimiter } from '../security/user-rate-limiter.js';
import type { CreateLocationDto } from './dto/create-location.dto.js';
import { buildLocationJobs, FutureTimestampError } from './location-jobs.js';
import { QueueBackpressure } from './queue-backpressure.js';

/**
 * Yazma tarafı: konumları doğrular, kapasite, gönderen ve kullanıcı sınırını kontrol eder,
 * kuyruğa atar. Sıra önemli: önce ucuz kontroller (doğrulama, bellekteki kuyruk derinliği),
 * sonra gönderenin o scooter için yetkisi, en son Redis'e giden rate limit; reddedilen istek
 * sayaç harcamaz.
 */
@Injectable()
export class LocationsService {
  constructor(
    private readonly lanes: LocationLanes,
    private readonly rateLimiter: UserRateLimiter,
    private readonly backpressure: QueueBackpressure,
    private readonly registry: ScooterRegistry,
    private readonly rentals: RentalsService,
  ) {}

  async enqueue(
    dto: CreateLocationDto,
    sender: Principal | undefined,
    requestId?: string,
    now = new Date(),
  ): Promise<{ jobId: string; recordedAt: string }> {
    const [job] = this.build([dto], requestId, now);
    this.backpressure.assertCapacity(1);
    await this.assertSender(sender, [dto.userId]);
    await this.rateLimiter.consume(new Map([[dto.userId, 1]]));

    const jobId = await this.lanes.add(job);
    locationsAccepted.inc();
    return { jobId, recordedAt: job.points[0].recordedAt };
  }

  /** Toplu ekleme: kullanıcı başına tek iş, her kullanıcının kendi şeridine. */
  async enqueueBatch(
    dtos: CreateLocationDto[],
    sender: Principal | undefined,
    requestId?: string,
    now = new Date(),
  ): Promise<{ accepted: number; jobIds: string[] }> {
    const jobs = this.build(dtos, requestId, now);
    this.backpressure.assertCapacity(jobs.length);
    await this.assertSender(
      sender,
      jobs.map((job) => job.userId),
    );
    await this.rateLimiter.consume(
      new Map(jobs.map((job) => [job.userId, job.points.length])),
    );

    const jobIds = await this.lanes.addMany(jobs);
    locationsAccepted.inc(dtos.length);
    return { accepted: dtos.length, jobIds };
  }

  /**
   * Kayıtsız kimlik kabul edilmez. Sürücü sadece kiraladığı scooter adına gönderir: kimlik
   * gövdeden gelse de oturumdaki kiralamayla karşılaştırılır, başkası adına konum gönderilemez.
   * API anahtarı (mobil backend, scooter'ın kendi cihazı) kayıtlı her scooter için gönderir;
   * park halindeki scooter da konumunu bildirir.
   */
  private async assertSender(
    sender: Principal | undefined,
    scooterIds: string[],
  ): Promise<void> {
    if (!isRider(sender)) {
      this.registry.assertRegistered(scooterIds);
      return;
    }
    const rented = await this.rentals.activeScooter(sender.riderId);
    if (!rented) {
      throw new ConflictException('Aktif kiralama yok: önce bir scooter seçin');
    }
    const other = scooterIds.find((id) => id !== rented);
    if (other !== undefined) {
      throw new ForbiddenException(
        `${other} size kiralı değil; kiraladığınız scooter: ${rented}`,
      );
    }
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
