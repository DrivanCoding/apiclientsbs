import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('transaction')
export class Transaction {
 @PrimaryGeneratedColumn()
 idtransaction: number;

 @Column()
 iduser: number;

 @Column()
 idcompte: number;

 @Column({ nullable: true })
 idcompteimpact?: number;

 @Column('decimal', { precision: 15, scale: 2 })
 montant_transaction: string;

 @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
 date_transaction: Date;

 @Column({ length: 254, nullable: true })
 references?: string;

 @Column({ type: 'text', nullable: true })
 description?: string;

 @Column({
 type: 'enum',
 enum: ['complete', 'annulee', 'en_attente'],
 default: 'complete',
 })
 statut: 'complete' | 'annulee' | 'en_attente';

 @Column({ type: 'enum', enum: ['versement', 'retrait'] })
 type_transaction: 'versement' | 'retrait';

 @Column({ length: 20, nullable: true })
 operateur?: string;
}
