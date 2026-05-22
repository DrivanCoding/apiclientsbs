import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('liste_operator')
export class ListeOperator {
  @PrimaryColumn()
  idliste_operator: number;

  @Column({ type: 'json' })
  liste_operator: Array<{
    nom: string;
    code: string;
    date_cration: string;
    idtype?: number;
    idtypecompte?: number;
    idcompte?: number;
  }>;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  date_creation: Date;

  @Column({
    type: 'datetime',
    nullable: true,
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  date_modification?: Date;
}
