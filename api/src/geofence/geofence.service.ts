import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeofenceRepository } from './geofence.repository.js';
import type {
  AreaEvent,
  AreaRef,
  ProcessResult,
  Transition,
} from './geofence.types.js';
import { diffPresence } from './presence-diff.js';
import { ProcessStatus } from './process-status.enum.js';
import type { UserLocation } from '../queue/queue.types.js';

@Injectable()
export class GeofenceService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly repository: GeofenceRepository,
  ) {}

  /**
   * Bir konumu işler: içinde bulunduğu alanları bulur, önceki durumla karşılaştırır,
   * giriş/çıkışları kaydeder. Aynı kullanıcının konumları farklı worker'larda eşzamanlı
   * işlenebildiği için tüm adımlar kullanıcıya özel advisory lock altında tek transaction'dır.
   */
  async process(location: UserLocation): Promise<ProcessResult> {
    return this.dataSource.transaction(async (manager) => {
      await this.repository.lockUser(manager, location.userId);
      const state = await this.repository.readState(manager, location);

      // Sırası karışık gelen (daha eski) konum, güncel durumu geriye götürmesin.
      if (
        state.lastRecordedAt &&
        state.lastRecordedAt >= new Date(location.recordedAt)
      ) {
        return { status: ProcessStatus.STALE } as const;
      }

      const { entered, exited } = diffPresence(
        state.present.map((a) => a.id),
        state.inside.map((a) => a.id),
      );
      // Konumların çoğu giriş/çıkış üretmez; onlarda diske yazmayı beklemeye gerek yok.
      if (entered.length === 0 && exited.length === 0) {
        await this.repository.relaxCommitDurability(manager);
      }
      const transitions = await this.repository.applyTransitions(
        manager,
        location,
        entered,
        exited,
      );

      return {
        status: ProcessStatus.PROCESSED,
        events: toEvents(location, transitions, [
          ...state.present,
          ...state.inside,
        ]),
        position: {
          userId: location.userId,
          lat: location.lat,
          lng: location.lng,
          recordedAt: location.recordedAt,
          areas: state.inside,
        },
      } as const;
    });
  }
}

/** Veritabanı geçişlerini canlı yayın olaylarına çevirir (alan adı ve tipiyle). */
function toEvents(
  location: UserLocation,
  transitions: Transition[],
  areas: AreaRef[],
): AreaEvent[] {
  const byId = new Map(areas.map((a) => [a.id, a]));
  return transitions.map((t) => ({
    logId: t.logId,
    userId: location.userId,
    eventType: t.eventType,
    area: byId.get(t.areaId)!,
    occurredAt: location.recordedAt,
  }));
}
