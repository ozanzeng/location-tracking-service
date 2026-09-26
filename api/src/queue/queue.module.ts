import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/configuration.js';
import { LOCATION_QUEUE } from './location-job.js';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        // BullMQ worker'ları bloklayan komutlar kullandığı için maxRetriesPerRequest null olmalı.
        connection: { url: config.redisUrl, maxRetriesPerRequest: null },
        prefix: config.queue.prefix,
      }),
    }),
    BullModule.registerQueue({
      name: LOCATION_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 200 },
        // Tamamlanan işleri Redis'te biriktirme; yük altında belleği korur.
        removeOnComplete: { count: 1000, age: 3600 },
        removeOnFail: { count: 5000 },
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
