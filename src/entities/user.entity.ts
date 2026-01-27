import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('user')
export class User {
 @PrimaryColumn()
 iduser: number;

 @Column()
 idag: number;

 @Column({ length: 100, nullable: true })
 email?: string;

 @Column({ length: 255 })
 password: string;
}
