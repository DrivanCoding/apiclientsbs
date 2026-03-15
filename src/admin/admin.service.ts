import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateAdminAgenceDto } from './dto/create-admin-agence.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { CreateAgenceCompteDto } from './dto/create-agence-compte.dto';
import { Agence } from '../entities/agence.entity';
import { User } from '../entities/user.entity';
import { Compte } from '../entities/compte.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Agence)
    private readonly agenceRepository: Repository<Agence>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Compte)
    private readonly compteRepository: Repository<Compte>,
  ) {}

  async createUser(dto: CreateAdminUserDto) {
    const agence = await this.agenceRepository.findOneBy({ idag: dto.idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable pour cet utilisateur');
    }

    const iduser = await this.nextId(this.userRepository, 'iduser');
    const user = this.userRepository.create({
      iduser,
      idag: dto.idag,
      nom: dto.nom.trim().toUpperCase(),
      prenom: dto.prenom.trim(),
      email: dto.email?.trim().toLowerCase(),
      password: dto.password,
    });

    return this.userRepository.save(user);
  }

  findUsers() {
    return this.userRepository.find({ order: { iduser: 'ASC' } });
  }

  async createAgence(dto: CreateAdminAgenceDto) {
    const idag = await this.nextId(this.agenceRepository, 'idag');
    const agence = this.agenceRepository.create({
      idag,
      idcompagnie: dto.idcompagnie,
      nom_agence: dto.nom_agence.trim(),
      alias_agence: dto.alias_agence?.trim(),
      ville: dto.ville?.trim(),
      telephone_agence: dto.telephone_agence?.trim(),
      statut_agence: 'actif',
    });

    return this.agenceRepository.save(agence);
  }

  findAgences() {
    return this.agenceRepository.find({ order: { idag: 'ASC' } });
  }

  async createCompteForAgence(idag: number, dto: CreateAgenceCompteDto) {
    const agence = await this.agenceRepository.findOneBy({ idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable');
    }

    const idcompte = await this.nextId(this.compteRepository, 'idcompte');
    const numeroCompte =
      dto.numero_compte?.trim() || this.generateNumeroCompte(idag, idcompte);

    const compte = this.compteRepository.create({
      idcompte,
      idag,
      idclient: dto.idclient,
      idtype: dto.idtype,
      solde: (dto.solde_initial ?? 0).toFixed(2),
      numero_compte: numeroCompte,
    });

    return this.compteRepository.save(compte);
  }

  findComptesByAgence(idag: number) {
    return this.compteRepository.find({
      where: { idag },
      order: { idcompte: 'ASC' },
    });
  }

  private async nextId<T extends object>(
    repository: Repository<T>,
    idColumn: string,
  ) {
    const row = await repository
      .createQueryBuilder('t')
      .select(`COALESCE(MAX(t.${idColumn}), 0) + 1`, 'nextId')
      .getRawOne<{ nextId: number }>();

    return Number(row?.nextId || 1);
  }

  private generateNumeroCompte(idag: number, idcompte: number) {
    const stamp = Date.now().toString().slice(-6);
    return `AG${String(idag).padStart(3, '0')}${stamp}${String(
      idcompte,
    ).padStart(4, '0')}`;
  }
}
