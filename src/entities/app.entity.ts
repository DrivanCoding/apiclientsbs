import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('app')
export class AppEntity {
  @PrimaryGeneratedColumn()
  idapp: number;

  @Column({ length: 100 })
  nom_app: string;

  @Column({ length: 255, unique: true })
  api_key: string;

  @Column({ length: 255 })
  secret_key: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  date_creation: Date;

  @Column({
    type: 'datetime',
    nullable: true,
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  date_modification?: Date;
}
