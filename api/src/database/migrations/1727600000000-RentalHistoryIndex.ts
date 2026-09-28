import type { MigrationInterface, QueryRunner } from 'typeorm';
import { dropIfInvalid } from './1727100000000-OpenVisitIndexAndHotUpdates.js';

/**
 * Operasyonun scooter detayı son kiralamaları gösterir (GET /scooters/:id). rentals her
 * kiralamada büyür; scooter'a göre en yeniden eskiye okuma index olmadan tabloyu tarardı.
 * Yazmaları kilitlememek için CONCURRENTLY, bu yüzden transaction dışında.
 */
export class RentalHistoryIndex1727600000000 implements MigrationInterface {
  name = 'RentalHistoryIndex1727600000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await dropIfInvalid(queryRunner, 'rentals_scooter_history_idx');
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS rentals_scooter_history_idx
         ON rentals (scooter_id, started_at DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS rentals_scooter_history_idx`,
    );
  }
}
