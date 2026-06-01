import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('compte')
export class Compte {
  @PrimaryColumn()
  idcompte: number;

  @Column()
  idtype: number;

  @Column('decimal', { precision: 15, scale: 2 })
  solde: string;

  @Column({ length: 55 })
  numero_compte: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  pin_code?: string | null;

  @Column({ nullable: true })
  idclient?: number;

  @Column({ nullable: true })
  idag?: number;
}
