import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sinyal kaybı: konum göndermeyi bırakan kullanıcının açık girişleri sonsuza dek "içeride"
 * kalmasın (bkz. SignalLossSweeper).
 *
 * - user_last_location.seen_at: sunucunun kullanıcıdan son konumu işlediği an. Sessizlik
 *   cihaz saatine (recorded_at) göre ölçülseydi, saati geride olan bir cihaz sürekli konum
 *   gönderirken bile sessiz sayılırdı. Index'i yok: son konum güncellemeleri HOT kalır.
 * - area_logs.signal_lost: çıkış, kullanıcı alandan çıktığı için değil, konumu kesildiği için
 *   yazıldı. O zaman exit_time girişin kapatıldığı andır.
 *
 * Büyük tabloda uzun kilit tutmamak için transaction dışında, adım adım ve tekrar
 * çalıştırılabilir biçimde:
 * - Sabit varsayılanlı kolon eklemek tabloyu yeniden yazmaz.
 * - Kısıt önce NOT VALID eklenir (anlık), sonra ayrı adımda doğrulanır; doğrulama yazmaları
 *   bloklamayan bir kilitle tabloyu tarar.
 * - seen_at'in varsayılanı, eski sürümün eklediği satırlar boş kalmasın diye doldurmadan önce
 *   konur. Var olan kullanıcılar için son konum zamanı kullanılır (en iyi tahmin).
 */
export class SignalLoss1727400000000 implements MigrationInterface {
  name = 'SignalLoss1727400000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user_last_location ADD COLUMN IF NOT EXISTS seen_at timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE user_last_location ALTER COLUMN seen_at SET DEFAULT now()`,
    );
    await queryRunner.query(
      `UPDATE user_last_location SET seen_at = recorded_at WHERE seen_at IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE user_last_location ALTER COLUMN seen_at SET NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE area_logs ADD COLUMN IF NOT EXISTS signal_lost boolean NOT NULL DEFAULT false`,
    );
    const [{ exists }] = await queryRunner.query(
      `SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area_logs_signal_lost_closed') AS exists`,
    );
    if (!exists) {
      await queryRunner.query(
        `ALTER TABLE area_logs ADD CONSTRAINT area_logs_signal_lost_closed
           CHECK (NOT signal_lost OR exit_time IS NOT NULL) NOT VALID`,
      );
    }
    await queryRunner.query(
      `ALTER TABLE area_logs VALIDATE CONSTRAINT area_logs_signal_lost_closed`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE area_logs DROP CONSTRAINT IF EXISTS area_logs_signal_lost_closed`,
    );
    await queryRunner.query(
      `ALTER TABLE area_logs DROP COLUMN IF EXISTS signal_lost`,
    );
    await queryRunner.query(
      `ALTER TABLE user_last_location DROP COLUMN IF EXISTS seen_at`,
    );
  }
}
