import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('clients')
export class Client {
  @PrimaryColumn()
  idclient: number;

  @Column({ length: 20 })
  code_client: string;

  @Column({ length: 100 })
  nom: string;

  @Column({ length: 50, nullable: true })
  prenom?: string;

  @Column({ length: 50 })
  piece_identite: string;

  @Column({ length: 50 })
  num_piece_identite: string;

  @Column({ length: 255 })
  adresse: string;

  @Column({ length: 10 })
  code_postal: string;

  @Column({ length: 50 })
  ville: string;

  @Column({ length: 100, nullable: true })
  email?: string;

  @Column({ length: 20, nullable: true })
  telephone_principal?: string;

  @Column({ length: 255, nullable: true })
  mot_de_passe?: string;

  @Column({ nullable: true })
  idag?: number;
}
