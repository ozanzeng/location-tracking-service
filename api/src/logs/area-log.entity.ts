import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Area } from '../areas/area.entity.js';
import {
  STORED_EXIT_REASONS,
  type StoredExitReason,
} from './exit-reason.enum.js';

/**
 * Bir kullanıcının bir alana yaptığı ziyaret: girişte açılır, çıkışta exitTime doldurulur.
 * exitTime'ı boş olan kayıtlar kullanıcının şu an içinde bulunduğu alanlardır.
 */
@Entity({ name: 'area_logs' })
export class AreaLog {
  // bigint pg sürücüsünden string olarak gelir.
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 64 })
  userId: string;

  @Column({ name: 'area_id', type: 'uuid' })
  areaId: string;

  @ManyToOne(() => Area, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'area_id' })
  area?: Area;

  @Column({ name: 'entry_time', type: 'timestamptz' })
  entryTime: Date;

  @Column({ name: 'exit_time', type: 'timestamptz', nullable: true })
  exitTime: Date | null;

  /**
   * Çıkış alandan dışarı konum gelmeden yazıldıysa sebebi (SIGNAL_LOST, AREA_CHANGED,
   * AREA_REMOVED); normal çıkışta boş. SIGNAL_LOST'ta exitTime girişin kapatıldığı andır.
   */
  @Column({
    name: 'exit_reason',
    type: 'enum',
    enum: STORED_EXIT_REASONS,
    enumName: 'area_exit_reason',
    nullable: true,
  })
  exitReason: StoredExitReason | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
