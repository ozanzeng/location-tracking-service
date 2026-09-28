import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Alan düzenleme ve silme.
 *
 * - areas.deleted_at: silme yumuşaktır. Silinen alan konum işlemede ve listede yok sayılır,
 *   ama giriş kayıtları kalır (area_logs → areas yabancı anahtarı ON DELETE CASCADE; gerçek
 *   silme geçmişi de silerdi). NULL varsayılanla eklendiği için tablo yeniden yazılmaz.
 * - Çıkış sebepleri: AREA_CHANGED (geometri değişti, scooter'ın son konumu yeni şeklin
 *   dışında kaldı) ve AREA_REMOVED (alan silindi). Enum'a değer eklemek geri alınamaz; geri
 *   alma sadece kolonu kaldırır, değerler kalır (IF NOT EXISTS ile tekrar çalıştırılabilir).
 */
export class AreaEdits1727600000000 implements MigrationInterface {
  name = 'AreaEdits1727600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE areas ADD COLUMN deleted_at timestamptz`,
    );
    await queryRunner.query(
      `ALTER TYPE area_exit_reason ADD VALUE IF NOT EXISTS 'AREA_CHANGED'`,
    );
    await queryRunner.query(
      `ALTER TYPE area_exit_reason ADD VALUE IF NOT EXISTS 'AREA_REMOVED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE areas DROP COLUMN deleted_at`);
  }
}
