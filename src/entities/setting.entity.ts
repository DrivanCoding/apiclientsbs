import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('setting')
export class Setting {
  @PrimaryColumn()
  idsetting: number;

  @Column({ type: 'json' })
  operator_actif: Array<{
    operateur: string;
    idtypecompte: number;
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
