import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PaymentStatus =
  | 'initiated'
  | 'pending'
  | 'complete'
  | 'failed'
  | 'cancelled';

@Entity('payment')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 120 })
  references: string;

  @Column({ length: 30, default: 'paynote' })
  gateway: string;

  @Index()
  @Column({ length: 20 })
  operateur: string;

  @Column({ length: 30 })
  numero_telephone: string;

  @Column('decimal', { precision: 15, scale: 2 })
  montant: string;

  @Index()
  @Column({
    type: 'enum',
    enum: ['initiated', 'pending', 'complete', 'failed', 'cancelled'],
    default: 'initiated',
  })
  statut: PaymentStatus;

  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  provider_message_id?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  provider_status?: string | null;

  @Column({ length: 50, default: 'versement' })
  type_operation: string;

  @Index()
  @Column({ type: 'int', nullable: true })
  idcompte?: number | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  idclient?: number | null;

  @Column({ type: 'int', nullable: true })
  iduser?: number | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'text', nullable: true })
  message_erreur?: string | null;

  @Column({ type: 'longtext', nullable: true })
  request_payload?: string | null;

  @Column({ type: 'longtext', nullable: true })
  response_payload?: string | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updated_at: Date;
}
