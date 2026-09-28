import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Operasyon paneli yöneticileri. Hesaplar API'den açılmaz: ilk yönetici migrate adımında
 * ADMIN_USERNAME / ADMIN_PASSWORD ile, sonrakiler `npm run admin:set` ile (admins/admin-cli.ts)
 * şema sahibi kullanıcıyla oluşturulur. Uygulama rolü sadece okur ve girişte şifre özetini
 * yeniler (database/app-role.ts).
 */
export class Admins1727900000000 implements MigrationInterface {
  name = 'Admins1727900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE admins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(32) NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        last_login_at timestamptz,
        CONSTRAINT admins_username_format CHECK (username ~ '^[a-z0-9_.-]{3,32}$')
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX admins_username_uq ON admins (username)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE admins`);
  }
}
