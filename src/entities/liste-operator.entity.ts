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
    idtype_credit?: number;
    idtype_debit?: number;
    idcompte_credit?: number;
    idcompte_debit?: number;
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
