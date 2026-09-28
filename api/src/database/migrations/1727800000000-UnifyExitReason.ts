import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Çıkış sebebi tek kolonda: area_logs.exit_reason (SIGNAL_LOST, AREA_CHANGED, AREA_REMOVED;
 * normal çıkışta boş). SignalLoss migration'ının eklediği signal_lost (evet/hayır) sadece bir
 * sebebi taşıyabiliyordu; alan düzenleme ve silme (FleetAndRiders, AreaEdits) ikisini daha
 * ekledi. Önce işaretli kayıtlar taşınır, sonra kısıt ve kolon kaldırılır. Sinyal kaybıyla
 * kapanan kayıt azdır; güncelleme kısa sürer. Kolon kaldırmak tabloyu yeniden yazmaz.
 */
export class UnifyExitReason1727800000000 implements MigrationInterface {
  name = 'UnifyExitReason1727800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE area_logs SET exit_reason = 'SIGNAL_LOST'
        WHERE signal_lost AND exit_reason IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE area_logs DROP CONSTRAINT IF EXISTS area_logs_signal_lost_closed`,
    );
    await queryRunner.query(
      `ALTER TABLE area_logs DROP COLUMN IF EXISTS signal_lost`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE area_logs ADD COLUMN signal_lost boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `UPDATE area_logs SET signal_lost = true WHERE exit_reason = 'SIGNAL_LOST'`,
    );
    await queryRunner.query(
      `ALTER TABLE area_logs ADD CONSTRAINT area_logs_signal_lost_closed
         CHECK (NOT signal_lost OR exit_time IS NOT NULL)`,
    );
  }
}
