import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Compte } from '../entities/compte.entity';

@Injectable()
export class ComptesService {
  constructor(
    @InjectRepository(Compte)
    private readonly repository: Repository<Compte>,
  ) {}

  create(payload: Partial<Compte>) {
    return this.repository.save(payload);
  }

  findAll() {
    return this.repository.find();
  }

  findOne(id: number) {
    return this.repository.findOneBy({ idcompte: id });
  }

  findByClient(idclient: number) {
    return this.repository.find({
      where: { idclient },
      order: { idcompte: 'ASC' },
    });
  }

  update(id: number, payload: Partial<Compte>) {
    return this.repository.update(id, payload);
  }

  remove(id: number) {
    return this.repository.delete(id);
  }
}
