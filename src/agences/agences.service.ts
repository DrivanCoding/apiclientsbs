import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agence } from '../entities/agence.entity';

@Injectable()
export class AgencesService {
  constructor(
    @InjectRepository(Agence)
    private readonly repository: Repository<Agence>,
  ) {}

  create(payload: Partial<Agence>) {
    return this.repository.save(payload);
  }

  findAll() {
    return this.repository.find();
  }

  findOne(id: number) {
    return this.repository.findOneBy({ idag: id });
  }

  update(id: number, payload: Partial<Agence>) {
    return this.repository.update(id, payload);
  }

  remove(id: number) {
    return this.repository.delete(id);
  }
}
