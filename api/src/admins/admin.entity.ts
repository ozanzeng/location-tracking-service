import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { USERNAME_MAX_LENGTH } from '../config/limits.js';

/** Operasyon paneli yöneticisi. Kullanıcı adı küçük harfle; şifre sadece özet olarak. */
@Entity({ name: 'admins' })
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: USERNAME_MAX_LENGTH })
  username: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt: Date | null;
}
