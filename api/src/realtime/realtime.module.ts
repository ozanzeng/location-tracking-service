import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module.js';
import { SecurityModule } from '../security/security.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeSubscriber } from './realtime.subscriber.js';

@Module({
  imports: [SecurityModule, FleetModule],
  providers: [RealtimeSubscriber, RealtimeGateway],
})
export class RealtimeModule {}
