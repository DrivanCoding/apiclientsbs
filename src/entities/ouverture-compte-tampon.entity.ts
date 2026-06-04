import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sbs_ouverture_compte_tampon')
export class OuvertureCompteTampon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  idclient: number;

  @Column()
  idtype: number;

  @Column({ nullable: true })
  idag?: number;

  @Column('decimal', { precision: 15, scale: 2 })
  montant_initial: string;

  @Column('double', { default: 0 })
  frais_ouverture: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  montant_minimum: string;

  @Column({ length: 20 })
  operateur: string;

  @Column({ length: 20 })
  numero_telephone: string;

  @Column({ length: 120 })
  references: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'longtext', nullable: true })
  payment_json?: string;

  @Column({ length: 30, default: 'pending_validation' })
  statut_validation: string;

  @Column({ type: 'text', nullable: true })
  message_validation?: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  updated_at: Date;
}
