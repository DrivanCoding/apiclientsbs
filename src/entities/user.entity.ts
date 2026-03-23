import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user')
export class User {
  @PrimaryColumn()
  iduser: number;

  @Column()
  idag: number;

  @Column({ length: 50 })
  nom: string;

  @Column({ length: 50 })
  prenom: string;

  @Column({ length: 100, nullable: true })
  email?: string;

  @Column({ length: 50, nullable: true })
  login?: string;

  @Column({ length: 255 })
  password: string;
}
