import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Typecompte } from '../entities/typecompte.entity';

@Injectable()
export class TypecomptesService {
  constructor(
    @InjectRepository(Typecompte)
    private readonly repository: Repository<Typecompte>,
  ) {}

  create(payload: Partial<Typecompte>) {
    return this.repository.save(payload);
  }

  findAll() {
    return this.repository.find();
  }

  findOne(id: number) {
    return this.repository.findOneBy({ idtype: id });
  }

  update(id: number, payload: Partial<Typecompte>) {
    return this.repository.update(id, payload);
  }

  remove(id: number) {
    return this.repository.delete(id);
  }
}
