import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('agence')
export class Agence {
 @PrimaryColumn()
 idag: number;

 @Column()
 idcompagnie: number;

 @Column({ length: 100 })
 nom_agence: string;

 @Column({ length: 10, nullable: true })
 alias_agence?: string;

 @Column({ length: 50, nullable: true })
 ville?: string;

 @Column({ length: 20, nullable: true })
 telephone_agence?: string;

 @Column({ type: 'date', nullable: true })
 date_ouverture?: string;

 @Column({
 type: 'enum',
 enum: ['actif', 'hors_service'],
 default: 'actif',
 })
 statut_agence: 'actif' | 'hors_service';
}
