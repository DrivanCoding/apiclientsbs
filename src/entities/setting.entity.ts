import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('setting')
export class Setting {
  @PrimaryColumn()
  idsetting: number;

  @Column({ type: 'json' })
  operator_actif: Array<{ operateur: string; idtypecompte: number }>;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  date_creation: Date;

  @Column({
    type: 'datetime',
    nullable: true,
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  date_modification?: Date;
}
