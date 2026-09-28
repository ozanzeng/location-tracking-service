import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Kurulumda hazır gelen filo; operasyon panelinden eklenip silinebilir. */
export const DEFAULT_SCOOTERS = [1, 2, 3, 4, 5].map((n) => {
  const no = String(n).padStart(2, '0');
  return { id: `scooter-${no}`, name: `Scooter ${no}` };
});

/**
 * Scooter filosu, sürücü hesapları ve kiralamalar.
 *
 * - scooters.id, konumlardaki userId'dir: mevcut kayıtlar ve POST /locations sözleşmesi
 *   değişmez; artık sadece kayıtlı scooter'lar konum gönderebilir. Silme yumuşaktır
 *   (deleted_at): silinen scooter'ın giriş kayıtları ve kiralama geçmişi kalır.
 * - rentals: bir scooter aynı anda tek sürücüde, bir sürücü aynı anda tek scooter'da.
 *   İki kısmi unique index bunu veritabanında garanti eder; iki sürücü aynı scooter'a aynı
 *   anda basarsa biri reddedilir.
 * - area_logs.exit_reason: sinyali kesilen scooter'ın açık girişleri son sinyal anıyla
 *   kapatılır ve bu kolonla işaretlenir (normal çıkışta NULL). Kolon NULL varsayılanla
 *   eklendiği için tablo yeniden yazılmaz; kısıt NOT VALID eklenip ayrıca doğrulanır:
 *   doğrulama tabloyu tararken okuma ve yazmaları bloklamaz.
 */
export class FleetAndRiders1727400000000 implements MigrationInterface {
  name = 'FleetAndRiders1727400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE scooters (
        id varchar(64) PRIMARY KEY,
        name varchar(80) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CONSTRAINT scooters_id_format CHECK (id ~ '^[A-Za-z0-9_.:-]+$')
      )`);
    await queryRunner.query(
      `INSERT INTO scooters (id, name)
       SELECT * FROM unnest($1::varchar[], $2::varchar[])
       ON CONFLICT (id) DO NOTHING`,
      [DEFAULT_SCOOTERS.map((s) => s.id), DEFAULT_SCOOTERS.map((s) => s.name)],
    );

    // Kullanıcı adı küçük harfle saklanır: "Ali" ve "ali" aynı hesaptır.
    await queryRunner.query(`
      CREATE TABLE riders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        username varchar(32) NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT riders_username_format CHECK (username ~ '^[a-z0-9_.-]{3,32}$')
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX riders_username_uq ON riders (username)`,
    );

    await queryRunner.query(
      `CREATE TYPE rental_end_reason AS ENUM ('RETURNED', 'SIGNAL_LOST')`,
    );
    await queryRunner.query(`
      CREATE TABLE rentals (
        id bigserial PRIMARY KEY,
        scooter_id varchar(64) NOT NULL REFERENCES scooters(id),
        rider_id uuid NOT NULL REFERENCES riders(id),
        started_at timestamptz NOT NULL DEFAULT now(),
        ended_at timestamptz,
        end_reason rental_end_reason,
        CONSTRAINT rentals_end_consistent CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
        CONSTRAINT rentals_end_after_start CHECK (ended_at IS NULL OR ended_at >= started_at)
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX rentals_active_scooter_uq ON rentals (scooter_id) WHERE ended_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX rentals_active_rider_uq ON rentals (rider_id) WHERE ended_at IS NULL`,
    );

    await queryRunner.query(
      `CREATE TYPE area_exit_reason AS ENUM ('SIGNAL_LOST')`,
    );
    await queryRunner.query(
      `ALTER TABLE area_logs ADD COLUMN exit_reason area_exit_reason`,
    );
    await queryRunner.query(
      `ALTER TABLE area_logs ADD CONSTRAINT area_logs_exit_reason_needs_exit
         CHECK (exit_reason IS NULL OR exit_time IS NOT NULL) NOT VALID`,
    );
    await queryRunner.query(
      `ALTER TABLE area_logs VALIDATE CONSTRAINT area_logs_exit_reason_needs_exit`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE area_logs DROP CONSTRAINT area_logs_exit_reason_needs_exit`,
    );
    await queryRunner.query(`ALTER TABLE area_logs DROP COLUMN exit_reason`);
    await queryRunner.query(`DROP TYPE area_exit_reason`);
    await queryRunner.query(`DROP TABLE rentals`);
    await queryRunner.query(`DROP TYPE rental_end_reason`);
    await queryRunner.query(`DROP TABLE riders`);
    await queryRunner.query(`DROP TABLE scooters`);
  }
}
