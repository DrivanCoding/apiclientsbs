import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('typecompte')
export class Typecompte {
 @PrimaryColumn()
 idtype: number;

 @Column({ length: 50 })
 libelle: string;

 @Column('decimal', { precision: 5, scale: 2 })
 taux_interet: string;
}
