import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import type { Job } from 'bullmq';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { LOCATION_QUEUE, type LocationJobData } from '../queue/location-job.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { GeofenceService } from './geofence.service.js';

@Processor(LOCATION_QUEUE)
export class LocationProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(LocationProcessor.name);

  constructor(
    private readonly geofence: GeofenceService,
    private readonly publisher: RealtimePublisher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.config.worker.concurrency;
    this.logger.log(
      `Worker hazır (concurrency=${this.config.worker.concurrency})`,
    );
  }

  async process(job: Job<LocationJobData>) {
    const result = await this.geofence.process(job.data);
    if (result.status === 'stale') {
      return { status: 'stale' };
    }
    await this.publisher.publish({
      position: result.position,
      events: result.events,
    });
    return { status: 'processed', events: result.events.length };
  }
}
