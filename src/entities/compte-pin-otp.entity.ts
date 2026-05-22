import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('compte_pin_otp')
export class ComptePinOtp {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  idcompte: number;

  @Column()
  idclient: number;

  @Column({ length: 255 })
  otp_code_hash: string;

  @Column({ type: 'datetime' })
  expires_at: Date;

  @Column({ type: 'datetime', nullable: true })
  consumed_at?: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;
}
