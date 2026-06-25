import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('sbs_preouverture_client_tampon')
export class PreouvertureClientTampon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  nom: string;

  @Column({ length: 50, nullable: true })
  prenom?: string;

  @Column({ length: 100 })
  email: string;

  @Column({ length: 20 })
  telephone_principal: string;

  @Column({ length: 20, nullable: true })
  numero_telephone?: string;

  @Column({ length: 255 })
  mot_de_passe: string;

  @Column({ length: 50, nullable: true })
  type_piece?: string;

  @Column({ length: 50, nullable: true })
  num_piece_identite?: string;

  @Column({ length: 255, nullable: true })
  adresse?: string;

  @Column({ length: 10, nullable: true })
  code_postal?: string;

  @Column({ length: 50, nullable: true })
  ville?: string;

  @Column()
  idag: number;

  @Column()
  idtype: number;

  @Column('decimal', { precision: 15, scale: 2 })
  montant_initial: string;

  @Column('double', { default: 0 })
  frais_ouverture: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  montant_minimum: string;

  @Column({ length: 20 })
  operateur: string;

  @Column({ length: 120 })
  references: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 255, nullable: true })
  photo_profil?: string;

  @Column({ length: 255, nullable: true })
  signature?: string;

  @Column({ length: 255, nullable: true })
  photo_cni?: string;

  @Column({ length: 255, nullable: true })
  photo_piece_recto?: string;

  @Column({ length: 255, nullable: true })
  photo_piece_verso?: string;

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
