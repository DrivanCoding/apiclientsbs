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
    const normalized: Partial<Typecompte> = {
      ...payload,
      idcategorie: payload.idcategorie ?? 1,
      numero: payload.numero ?? 1,
      type: payload.type ?? '1',
      taux_interet: payload.taux_interet ?? '0.00',
    };
    return this.repository.save(normalized);
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
