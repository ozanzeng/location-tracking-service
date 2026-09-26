import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Kullanıcının en son işlenen konumu; sırası karışık gelen eski konumları elemek için. */
@Entity({ name: 'user_last_location' })
export class UserLastLocation {
  @PrimaryColumn({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ type: 'double precision' })
  lat: number;

  @Column({ type: 'double precision' })
  lng: number;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}
