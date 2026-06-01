import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('typecompte')
export class Typecompte {
  @PrimaryColumn()
  idtype: number;

  @Column({ length: 50 })
  libelle: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  taux_interet: string;

  @Column('decimal', { precision: 10, scale: 2, default: 0 })
  frais_tenue_compte?: string;

  @Column('decimal', { precision: 15, scale: 2, nullable: true })
  plafond?: string;

  @Column('double', { nullable: true })
  frais_ouverture?: number;

  @Column('double', { nullable: true })
  frais_retrait?: number;

  @Column({ length: 3, nullable: true })
  code_type?: string;

  @Column({ default: 1 })
  idcategorie: number;

  @Column({ default: 1 })
  numero: number;

  @Column({ type: 'enum', enum: ['1', '2', '3'], default: '1' })
  type: '1' | '2' | '3';

  @Column({ nullable: true })
  idparent?: number;

  @Column({ default: 0 })
  mobile_sync_enabled: number;

  @Column({ default: 0 })
  mobile_can_open: number;

  @Column({ default: 1 })
  mobile_can_view: number;

  @Column({ default: 1 })
  mobile_can_deposit: number;
}
