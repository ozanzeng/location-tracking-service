import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * pg_stat_statements: hangi sorgunun toplamda ne kadar zaman harcadığını gösterir (yük
 * testinde darboğazı bulmak için). Sunucunun kütüphaneyi açılışta yüklemesi gerekir
 * (docker-compose: shared_preload_libraries). Eklenti "trusted" değildir: yönetilen bir
 * veritabanında migration kullanıcısı superuser değilse ya da eklenti kurulu değilse bu adım
 * atlanır; orada sağlayıcının ayarından açılır (README).
 */
export class QueryStats1727300000000 implements MigrationInterface {
  name = 'QueryStats1727300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const allowed: unknown[] = await queryRunner.query(
      `SELECT 1 FROM pg_available_extension_versions v
        WHERE v.name = 'pg_stat_statements'
          AND (v.trusted OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user))
        LIMIT 1`,
    );
    if (allowed.length === 0) return;
    await queryRunner.query(
      `CREATE EXTENSION IF NOT EXISTS pg_stat_statements`,
    );
  }

  // Init gibi eklentiyi geri almada kaldırmaz: önceden kurulmuş (ör. yönetici tarafından)
  // olabilir ve şemadaki hiçbir şey ona bağlı değildir.
  public async down(): Promise<void> {}
}
