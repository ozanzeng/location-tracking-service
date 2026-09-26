import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 3 milyon kayıtlı bench veritabanında yapılan ölçümlere göre:
 *
 * 1. "Hâlâ içeride" (exit_time IS NULL) filtresiyle sayfalama, açık girişler bitince
 *    tüm tabloyu tarıyordu (2,27 sn). Sadece açık girişleri kapsayan küçük bir index
 *    bunu 0,04 ms'ye indirir.
 * 2. user_last_location her konumda güncellenir. recorded_at üzerindeki index bu
 *    güncellemelerin HOT (index'e dokunmayan) olmasını engelliyordu: HOT oranı %0,
 *    tablo yük altında şişiyordu. Index kalkınca ve sayfalarda boşluk bırakılınca
 *    (fillfactor) HOT oranı %100 olur. Index'i kullanan tek sorgu (GET /locations/latest)
 *    50 bin kullanıcıda tabloyu 11 ms'de tarar ve sadece operasyon ekranı açılınca çalışır.
 *
 * Büyük tabloda yazmaları kilitlememek için index CONCURRENTLY oluşturulur; bu yüzden
 * migration transaction dışında çalışır.
 */
export class OpenVisitIndexAndHotUpdates1727100000000 implements MigrationInterface {
  name = 'OpenVisitIndexAndHotUpdates1727100000000';
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS area_logs_open_entry_idx
         ON area_logs (entry_time DESC, id DESC) WHERE exit_time IS NULL`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS user_last_location_recorded_idx`,
    );
    // fillfactor yeni sayfalara uygulanır; mevcut tablo ilk VACUUM FULL/yeniden yazımda sıkışır.
    // Sık güncellenen küçük tablo: autovacuum daha erken devreye girsin.
    await queryRunner.query(
      `ALTER TABLE user_last_location SET (
         fillfactor = 70,
         autovacuum_vacuum_scale_factor = 0.02,
         autovacuum_analyze_scale_factor = 0.05
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE user_last_location RESET (fillfactor, autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor)`,
    );
    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS user_last_location_recorded_idx ON user_last_location (recorded_at DESC)`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS area_logs_open_entry_idx`,
    );
  }
}
