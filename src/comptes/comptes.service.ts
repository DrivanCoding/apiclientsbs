import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Compte } from '../entities/compte.entity';
import { VerifyComptePinDto } from './dto/verify-compte-pin.dto';

@Injectable()
export class ComptesService {
  constructor(
    @InjectRepository(Compte)
    private readonly repository: Repository<Compte>,
  ) {}

  async create(payload: Partial<Compte>) {
    const pin_code = await this.hashPin(payload.pin_code);
    const saved = await this.repository.save({ ...payload, pin_code });
    return this.toCompteResponse(saved);
  }

  async findAll() {
    const comptes = await this.repository.find();
    return comptes.map((compte) => this.toCompteResponse(compte));
  }

  async findOne(id: number) {
    const compte = await this.repository.findOneBy({ idcompte: id });
    return compte ? this.toCompteResponse(compte) : null;
  }

  async findByClient(idclient: number) {
    const comptes = await this.repository.find({
      where: { idclient },
      order: { idcompte: 'ASC' },
    });
    return comptes.map((compte) => this.toCompteResponse(compte, false));
  }

  async findByAgence(idag: number) {
    const comptes = await this.repository.find({
      where: { idag },
      order: { idcompte: 'ASC' },
    });
    return comptes.map((compte) => this.toCompteResponse(compte));
  }

  async verifyPinAndGetCompteDetail(
    idcompte: number,
    payload: VerifyComptePinDto,
  ) {
    const where = payload.idclient
      ? { idcompte, idclient: payload.idclient }
      : { idcompte };

    const compte = await this.repository.findOneBy(where);
    if (!compte) {
      throw new NotFoundException('Compte introuvable');
    }

    if (!compte.pin_code) {
      return this.toCompteResponse(compte, true);
    }

    const isMatch = await bcrypt.compare(payload.pin_code, compte.pin_code);
    if (!isMatch) {
      throw new UnauthorizedException('Code PIN incorrect');
    }

    return this.toCompteResponse(compte, true);
  }

  async update(id: number, payload: Partial<Compte>) {
    const pin_code =
      payload.pin_code !== undefined
        ? await this.hashPin(payload.pin_code)
        : undefined;

    const updatePayload =
      pin_code !== undefined ? { ...payload, pin_code } : payload;

    const result = await this.repository.update(id, updatePayload);
    const updated = await this.repository.findOneBy({ idcompte: id });

    return {
      ...result,
      compte: updated ? this.toCompteResponse(updated) : null,
    };
  }

  remove(id: number) {
    return this.repository.delete(id);
  }

  private async hashPin(pin?: string) {
    if (!pin) return undefined;
    const normalized = pin.trim();
    if (!/^\d{4,6}$/.test(normalized)) {
      throw new BadRequestException('Le code PIN doit contenir 4 a 6 chiffres');
    }
    return bcrypt.hash(normalized, 10);
  }

  private toCompteResponse(compte: Compte, includeSensitive = true) {
    const { pin_code: _pin, ...safeCompte } = compte;
    return {
      ...safeCompte,
      solde: includeSensitive ? safeCompte.solde : _pin ? null : safeCompte.solde,
      has_pin: Boolean(_pin),
    };
  }
}
