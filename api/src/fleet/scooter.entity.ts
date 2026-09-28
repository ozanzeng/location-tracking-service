import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import {
  SCOOTER_NAME_MAX_LENGTH,
  USER_ID_MAX_LENGTH,
} from '../config/limits.js';

/**
 * Filodaki scooter. Kimliği konumlardaki userId'dir; sadece kayıtlı ve silinmemiş scooter'lar
 * konum gönderebilir. Silme yumuşaktır (deletedAt): giriş kayıtları ve kiralama geçmişi kalır.
 */
@Entity({ name: 'scooters' })
export class Scooter {
  @PrimaryColumn({ type: 'varchar', length: USER_ID_MAX_LENGTH })
  id: string;

  @Column({ type: 'varchar', length: SCOOTER_NAME_MAX_LENGTH })
  name: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
