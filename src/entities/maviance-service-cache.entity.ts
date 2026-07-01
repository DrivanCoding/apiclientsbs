import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('maviance_service_cache')
export class MavianceServiceCache {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ length: 191 })
  payItemId: string; // Unique payment item identifier from Maviance

  @Column({ type: 'int' })
  serviceId: number; // Service category/merchant identifier from Maviance

  @Column({ length: 155 })
  name: string; // Friendly name of the payment service (e.g. ENEO Pay)

  @Column({ length: 100 })
  category: string; // Service category (e.g. UTILITY, TELECOM)

  @Column({ length: 100 })
  merchant: string; // Merchant name (e.g. ENEO, Orange, MTN)

  @Column({ type: 'longtext' })
  rawPayload: string; // Full service details JSON string

  @CreateDateColumn({ type: 'datetime' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt: Date;
}
