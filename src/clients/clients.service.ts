import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Client } from '../entities/client.entity';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client)
    private readonly repository: Repository<Client>,
  ) {}

  create(payload: Partial<Client>) {
    return this.repository.save(payload);
  }

  findAll() {
    return this.repository.find();
  }

  findOne(id: number) {
    return this.repository.findOneBy({ idclient: id });
  }

  findByEmail(email: string) {
    return this.repository.findOneBy({ email });
  }

  findByLoginIdentifier(identifier: string) {
    const normalized = identifier.trim();
    return this.repository.findOne({
      where: [{ email: normalized.toLowerCase() }, { code_client: normalized }],
    });
  }

  async update(id: number, payload: Partial<Client>) {
    if (payload.mot_de_passe !== undefined && payload.mot_de_passe !== null) {
      payload.mot_de_passe = await bcrypt.hash(payload.mot_de_passe.trim(), 10);
    }
    return this.repository.update(id, payload);
  }

  remove(id: number) {
    return this.repository.delete(id);
  }
}
