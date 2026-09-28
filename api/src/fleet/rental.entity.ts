import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { USER_ID_MAX_LENGTH } from '../config/limits.js';
import { RentalEndReason } from './rental-end-reason.enum.js';

/**
 * Bir sürücünün bir scooter'ı kullandığı süre. endedAt'i boş olan kiralama aktiftir; bir
 * scooter'ın ve bir sürücünün en fazla bir aktif kiralaması olabilir (kısmi unique index'ler).
 */
@Entity({ name: 'rentals' })
export class Rental {
  // bigint pg sürücüsünden string olarak gelir.
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'scooter_id', type: 'varchar', length: USER_ID_MAX_LENGTH })
  scooterId: string;

  @Column({ name: 'rider_id', type: 'uuid' })
  riderId: string;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({
    name: 'end_reason',
    type: 'enum',
    enum: RentalEndReason,
    enumName: 'rental_end_reason',
    nullable: true,
  })
  endReason: RentalEndReason | null;
}
