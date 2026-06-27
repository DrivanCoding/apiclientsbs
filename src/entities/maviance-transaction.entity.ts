import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('maviance_transactions')
export class MavianceTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 50 })
  reference: string; // Internal unique reference, e.g. MAV-20260627-XXXX

  @Index()
  @Column({ length: 100, nullable: true })
  ptn?: string; // Smobilpay Transaction Number (returned by collect/verify)

  @Column({ length: 100, nullable: true })
  quoteId?: string; // Quote ID from the /quotestd response

  @Column({ type: 'int' })
  payItemId: number; // Payment Item ID (identifying the specific service/utility)

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ length: 10, default: 'XAF' })
  currency: string;

  @Column({ length: 30 })
  customerPhonenumber: string;

  @Column({ length: 150 })
  customerEmailaddress: string;

  @Column({ length: 150, nullable: true })
  customerName?: string;

  @Column({ length: 150, nullable: true })
  customerAddress?: string;

  @Column({ length: 100, nullable: true })
  serviceNumber?: string; // E.g., meter number, policy number

  @Column({ length: 100, nullable: true })
  customerNumber?: string; // E.g., customer account number

  @Column({
    type: 'enum',
    enum: ['INITIATED', 'QUOTED', 'PENDING', 'SUCCESS', 'FAILED', 'EXPIRED'],
    default: 'INITIATED',
  })
  status: 'INITIATED' | 'QUOTED' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';

  @Column({ length: 20, nullable: true })
  errorCode?: string;

  @Column({ length: 255, nullable: true })
  errorMessage?: string;

  @Column({ type: 'int' })
  idcompte: number; // Linked internal bank account (Compte)

  @Column({ type: 'int', nullable: true })
  idclient?: number; // Linked internal client (Client)

  @Column({ type: 'int', nullable: true })
  iduser?: number; // Linked cashier/user initiating the transaction

  @Column({ type: 'longtext', nullable: true })
  rawRequest?: string; // Raw request payload sent (masked)

  @Column({ type: 'longtext', nullable: true })
  rawResponse?: string; // Raw response payload received (masked)

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
