import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeSubscriber } from './realtime.subscriber.js';

@Module({ providers: [RealtimeSubscriber, RealtimeGateway] })
export class RealtimeModule {}
