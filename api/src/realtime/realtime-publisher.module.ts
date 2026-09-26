import { Module } from '@nestjs/common';
import { RealtimePublisher } from './realtime.publisher.js';

/** Hem worker'ın hem API'nin Redis'e yayın yapabilmesi için. */
@Module({
  providers: [RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimePublisherModule {}
