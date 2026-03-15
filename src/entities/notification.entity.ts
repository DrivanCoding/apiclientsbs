import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notification')
export class Notification {
  @PrimaryGeneratedColumn()
  idnotification: number;

  @Column()
  idclient: number;

  @Column({ length: 120 })
  titre: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ length: 40, default: 'versement' })
  type: string;

  @Column({ type: 'tinyint', width: 1, default: () => '0' })
  lu: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  date_creation: Date;
}
