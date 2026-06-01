import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('actualite')
export class Actualite {
  @PrimaryGeneratedColumn()
  idactualite: number;

  @Column({ length: 255 })
  titre: string;

  @Column({ type: 'text' })
  contenu: string;

  @Column({ length: 255, nullable: true })
  imageUrl: string;

  @Column({ length: 50, nullable: true })
  categorie: string;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  date_creation: Date;
}
