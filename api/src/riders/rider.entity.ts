import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { USERNAME_MAX_LENGTH } from '../config/limits.js';

/** Sürücü hesabı. Kullanıcı adı küçük harfle saklanır; şifre sadece özet olarak (password.ts). */
@Entity({ name: 'riders' })
export class Rider {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: USERNAME_MAX_LENGTH })
  username: string;

  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
