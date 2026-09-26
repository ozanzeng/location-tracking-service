import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1727000000000 implements MigrationInterface {
  name = 'Init1727000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

    await queryRunner.query(
      `CREATE TYPE area_type AS ENUM ('NO_RIDE', 'SLOW', 'NO_PARKING', 'PARKING', 'SERVICE')`,
    );
    await queryRunner.query(`
      CREATE TABLE areas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(120) NOT NULL,
        type area_type NOT NULL,
        geom geometry(Polygon, 4326) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT areas_geom_valid CHECK (ST_IsValid(geom))
      )`);
    // Nokta-içinde-poligon sorgusu bu index üzerinden bounding box ile daraltılır.
    await queryRunner.query(
      `CREATE INDEX areas_geom_gist ON areas USING GIST (geom)`,
    );

    await queryRunner.query(`
      CREATE TABLE user_last_location (
        user_id varchar(64) PRIMARY KEY,
        lat double precision NOT NULL,
        lng double precision NOT NULL,
        recorded_at timestamptz NOT NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX user_last_location_recorded_idx ON user_last_location (recorded_at DESC)`,
    );

    // Her satır bir ziyaret: giriş anında açılır, çıkışta exit_time doldurulur.
    await queryRunner.query(`
      CREATE TABLE area_logs (
        id bigserial PRIMARY KEY,
        user_id varchar(64) NOT NULL,
        area_id uuid NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
        entry_time timestamptz NOT NULL,
        exit_time timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT area_logs_exit_after_entry CHECK (exit_time IS NULL OR exit_time >= entry_time)
      )`);
    // Bir kullanıcının aynı alanda en fazla bir açık ziyareti olabilir; kullanıcının
    // şu an içinde olduğu alanlar da bu index'ten okunur.
    await queryRunner.query(
      `CREATE UNIQUE INDEX area_logs_open_visit_uq ON area_logs (user_id, area_id) WHERE exit_time IS NULL`,
    );
    // GET /logs sıralaması (entry_time DESC, id DESC) ve filtreleri için.
    await queryRunner.query(
      `CREATE INDEX area_logs_entry_idx ON area_logs (entry_time DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX area_logs_user_idx ON area_logs (user_id, entry_time DESC, id DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX area_logs_area_idx ON area_logs (area_id, entry_time DESC, id DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE area_logs`);
    await queryRunner.query(`DROP TABLE user_last_location`);
    await queryRunner.query(`DROP TABLE areas`);
    await queryRunner.query(`DROP TYPE area_type`);
  }
}
