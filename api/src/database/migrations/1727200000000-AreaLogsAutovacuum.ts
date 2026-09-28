import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * area_logs büyüyen ve eskimeyen bir tablo: her giriş bir satır ekler, her çıkış o satırı bir kez
 * günceller. exit_time kısmi index'lerin koşulunda geçtiği için bu güncelleme HOT olamaz: ölü
 * satır bırakır ve tüm index'lere yeni kayıt ekler. Varsayılan eşikle (%20) 100 milyon satırda
 * temizlik ancak 20 milyon çıkıştan sonra başlar; bu sürede tablo ve index'ler şişer.
 * Eşikler %2'ye çekilir: temizlik ve istatistik tablo büyüdükçe seyrekleşmez. Eklemeyle
 * tetiklenen temizlik (insert) görünürlük haritasını güncel tutar; kayıt sorguları
 * (index-only scan) yığına daha az gider.
 *
 * ALTER TABLE ... SET (autovacuum_*) okuma ve yazmaları bloklamayan bir kilit alır; yine de
 * tabloda uzun süren bir VACUUM ya da index oluşturma varsa deploy beklemesin diye
 * lock_timeout konur.
 */
export class AreaLogsAutovacuum1727200000000 implements MigrationInterface {
  name = 'AreaLogsAutovacuum1727200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(
      `ALTER TABLE area_logs SET (
         autovacuum_vacuum_scale_factor = 0.02,
         autovacuum_vacuum_insert_scale_factor = 0.02,
         autovacuum_analyze_scale_factor = 0.02
       )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`SET LOCAL lock_timeout = '5s'`);
    await queryRunner.query(
      `ALTER TABLE area_logs RESET (
         autovacuum_vacuum_scale_factor,
         autovacuum_vacuum_insert_scale_factor,
         autovacuum_analyze_scale_factor
       )`,
    );
  }
}
