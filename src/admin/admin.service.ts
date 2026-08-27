import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { CreateAdminAgenceDto } from './dto/create-admin-agence.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { CreateAgenceCompteDto } from './dto/create-agence-compte.dto';
import { UpdateAgenceCompteDto } from './dto/update-agence-compte.dto';
import { UpdateAdminAgenceDto } from './dto/update-admin-agence.dto';
import { CreateAdminClientDto } from './dto/create-admin-client.dto';
import { UpdateAdminClientDto } from './dto/update-admin-client.dto';
import { CreateAdminTypecompteDto } from './dto/create-admin-typecompte.dto';
import { UpdateAdminTypecompteDto } from './dto/update-admin-typecompte.dto';
import { CreateClientCompteDto } from './dto/create-client-compte.dto';
import { UpdateClientCompteDto } from './dto/update-client-compte.dto';
import { CreateAdminOperatorDto } from './dto/create-admin-operator.dto';
import { UpdateAdminOperatorActivationDto } from './dto/update-admin-operator-activation.dto';
import { CreateAdminAppDto } from './dto/create-admin-app.dto';
import { Agence } from '../entities/agence.entity';
import { User } from '../entities/user.entity';
import { Compte } from '../entities/compte.entity';
import { Client } from '../entities/client.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { Transaction } from '../entities/transaction.entity';
import { ListeOperator } from '../entities/liste-operator.entity';
import { Setting } from '../entities/setting.entity';
import { AppEntity } from '../entities/app.entity';
import { Notification } from '../entities/notification.entity';
import { OuvertureCompteTampon } from '../entities/ouverture-compte-tampon.entity';
import { PreouvertureClientTampon } from '../entities/preouverture-client-tampon.entity';

@Injectable()
export class AdminService {
  private readonly defaultOperatorTypeFallbackId = 1;

  constructor(
    @InjectRepository(Agence)
    private readonly agenceRepository: Repository<Agence>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Compte)
    private readonly compteRepository: Repository<Compte>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(Typecompte)
    private readonly typecompteRepository: Repository<Typecompte>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(ListeOperator)
    private readonly listeOperatorRepository: Repository<ListeOperator>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    @InjectRepository(AppEntity)
    private readonly appRepository: Repository<AppEntity>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(OuvertureCompteTampon)
    private readonly ouvertureTamponRepository: Repository<OuvertureCompteTampon>,
    @InjectRepository(PreouvertureClientTampon)
    private readonly preouvertureTamponRepository: Repository<PreouvertureClientTampon>,
  ) {}

  async createUser(dto: CreateAdminUserDto) {
    const agence = await this.agenceRepository.findOneBy({ idag: dto.idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable pour cet utilisateur');
    }

    if (dto.email) {
      const existingEmail = await this.userRepository.findOneBy({
        email: dto.email.trim().toLowerCase(),
      });
      if (existingEmail) {
        throw new ConflictException('Cet email utilisateur existe deja');
      }
    }

    if (dto.login) {
      const existingLogin = await this.userRepository.findOneBy({
        login: dto.login.trim().toLowerCase(),
      });
      if (existingLogin) {
        throw new ConflictException('Ce login utilisateur existe deja');
      }
    }

    const iduser = await this.nextId(this.userRepository, 'iduser');
    const user = this.userRepository.create({
      iduser,
      idag: dto.idag,
      nom: dto.nom.trim().toUpperCase(),
      prenom: dto.prenom.trim(),
      email: dto.email?.trim().toLowerCase(),
      login: dto.login?.trim().toLowerCase(),
      password: await bcrypt.hash(dto.password, 10),
    });

    const saved = await this.userRepository.save(user);
    return this.toUserResponse(saved);
  }

  async findUsers() {
    const users = await this.userRepository.find({ order: { iduser: 'ASC' } });
    return users.map((user) => this.toUserResponse(user));
  }

  async findUserById(iduser: number) {
    const user = await this.userRepository.findOneBy({ iduser });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }
    return this.toUserResponse(user);
  }

  async updateUser(iduser: number, dto: UpdateAdminUserDto) {
    const user = await this.userRepository.findOneBy({ iduser });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    if (dto.idag !== undefined) {
      const agence = await this.agenceRepository.findOneBy({ idag: dto.idag });
      if (!agence) {
        throw new NotFoundException('Agence introuvable pour cet utilisateur');
      }
    }

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existingEmail = await this.userRepository.findOneBy({
        email: normalizedEmail,
      });
      if (existingEmail && existingEmail.iduser !== iduser) {
        throw new ConflictException('Cet email utilisateur existe deja');
      }
    }

    if (dto.login !== undefined) {
      const normalizedLogin = dto.login.trim().toLowerCase();
      const existingLogin = await this.userRepository.findOneBy({
        login: normalizedLogin,
      });
      if (existingLogin && existingLogin.iduser !== iduser) {
        throw new ConflictException('Ce login utilisateur existe deja');
      }
    }

    const updatePayload: Partial<User> = {};
    if (dto.idag !== undefined) updatePayload.idag = dto.idag;
    if (dto.nom !== undefined) updatePayload.nom = dto.nom.trim().toUpperCase();
    if (dto.prenom !== undefined) updatePayload.prenom = dto.prenom.trim();
    if (dto.email !== undefined)
      updatePayload.email = dto.email.trim().toLowerCase();
    if (dto.login !== undefined)
      updatePayload.login = dto.login.trim().toLowerCase();
    if (dto.password !== undefined) {
      updatePayload.password = await bcrypt.hash(dto.password.trim(), 10);
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestException('Aucune donnee a mettre a jour');
    }

    await this.userRepository.update({ iduser }, updatePayload);
    return this.findUserById(iduser);
  }

  async removeUser(iduser: number) {
    const user = await this.userRepository.findOneBy({ iduser });
    if (!user) {
      throw new NotFoundException('Utilisateur introuvable');
    }

    const transactionsCount = await this.transactionRepository.count({
      where: { iduser },
    });
    if (transactionsCount > 0) {
      throw new BadRequestException(
        'Suppression impossible: cet utilisateur possede des transactions',
      );
    }

    await this.userRepository.delete({ iduser });
    return { success: true, iduser };
  }

  async findAgenceById(idag: number) {
    const agence = await this.agenceRepository.findOneBy({ idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable');
    }
    return agence;
  }

  async createAgence(dto: CreateAdminAgenceDto) {
    const idag = dto.idag ?? (await this.nextId(this.agenceRepository, 'idag'));
    const existing = await this.agenceRepository.findOneBy({ idag });
    if (existing) {
      existing.idcompagnie = dto.idcompagnie;
      existing.nom_agence = dto.nom_agence.trim();
      existing.alias_agence = dto.alias_agence?.trim();
      existing.ville = dto.ville?.trim();
      existing.telephone_agence = dto.telephone_agence?.trim();
      existing.date_ouverture = dto.date_ouverture;
      existing.statut_agence = dto.statut_agence ?? existing.statut_agence;
      return this.agenceRepository.save(existing);
    }

    const agence = this.agenceRepository.create({
      idag,
      idcompagnie: dto.idcompagnie,
      nom_agence: dto.nom_agence.trim(),
      alias_agence: dto.alias_agence?.trim(),
      ville: dto.ville?.trim(),
      telephone_agence: dto.telephone_agence?.trim(),
      date_ouverture: dto.date_ouverture,
      statut_agence: dto.statut_agence ?? 'actif',
    });

    return this.agenceRepository.save(agence);
  }

  findAgences() {
    return this.agenceRepository.find({ order: { idag: 'ASC' } });
  }

  async updateAgence(idag: number, dto: UpdateAdminAgenceDto) {
    const agence = await this.agenceRepository.findOneBy({ idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable');
    }

    const updatePayload: Partial<Agence> = {};
    if (dto.idcompagnie !== undefined)
      updatePayload.idcompagnie = dto.idcompagnie;
    if (dto.nom_agence !== undefined)
      updatePayload.nom_agence = dto.nom_agence.trim();
    if (dto.alias_agence !== undefined)
      updatePayload.alias_agence = dto.alias_agence.trim();
    if (dto.ville !== undefined) updatePayload.ville = dto.ville.trim();
    if (dto.telephone_agence !== undefined) {
      updatePayload.telephone_agence = dto.telephone_agence.trim();
    }
    if (dto.date_ouverture !== undefined)
      updatePayload.date_ouverture = dto.date_ouverture;
    if (dto.statut_agence !== undefined)
      updatePayload.statut_agence = dto.statut_agence;

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestException('Aucune donnee a mettre a jour');
    }

    await this.agenceRepository.update({ idag }, updatePayload);
    return this.findAgenceById(idag);
  }

  async removeAgence(idag: number) {
    const agence = await this.agenceRepository.findOneBy({ idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable');
    }

    const [usersCount, comptesCount, clientsCount] = await Promise.all([
      this.userRepository.count({ where: { idag } }),
      this.compteRepository.count({ where: { idag } }),
      this.clientRepository.count({ where: { idag } }),
    ]);

    if (usersCount || comptesCount || clientsCount) {
      throw new BadRequestException(
        "Suppression impossible: l'agence contient encore des utilisateurs, clients ou comptes",
      );
    }

    await this.agenceRepository.delete({ idag });
    return { success: true, idag };
  }

  async findClients(page?: number, limit?: number) {
    const options: any = {
      order: { idclient: 'ASC' },
    };
    if (page !== undefined && limit !== undefined) {
      options.skip = (page - 1) * limit;
      options.take = limit;
    }
    const clients = await this.clientRepository.find(options);
    return clients.map((client) => this.toClientResponse(client));
  }

  async findClientById(idclient: number) {
    const client = await this.clientRepository.findOneBy({ idclient });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }
    return this.toClientResponse(client);
  }

  async createClient(dto: CreateAdminClientDto) {
    if (dto.idag !== undefined) {
      const agence = await this.agenceRepository.findOneBy({ idag: dto.idag });
      if (!agence) {
        throw new NotFoundException('Agence introuvable pour ce client');
      }
    }

    const idclient =
      dto.idclient ?? (await this.nextId(this.clientRepository, 'idclient'));
    const codeClient =
      dto.code_client?.trim() || this.generateClientCode(idclient);
    const existingId = await this.clientRepository.findOneBy({ idclient });
    if (existingId) {
      if (existingId.code_client !== codeClient) {
        const existingCodeForOtherClient =
          await this.clientRepository.findOneBy({
            code_client: codeClient,
          });
        if (
          existingCodeForOtherClient &&
          existingCodeForOtherClient.idclient !== idclient
        ) {
          throw new ConflictException('Ce code client existe deja');
        }
      }

      existingId.code_client = codeClient;
      existingId.nom = dto.nom.trim().toUpperCase();
      existingId.prenom = dto.prenom?.trim();
      existingId.piece_identite = dto.piece_identite.trim();
      existingId.num_piece_identite = dto.num_piece_identite.trim();
      existingId.adresse = dto.adresse.trim();
      existingId.code_postal = dto.code_postal.trim();
      existingId.ville = dto.ville.trim();
      existingId.email = dto.email?.trim().toLowerCase();
      existingId.telephone_principal = dto.telephone_principal?.trim();
      existingId.idag = dto.idag;
      if (dto.mot_de_passe) {
        const isAlreadyHashed =
          dto.mot_de_passe.startsWith('$2a$') ||
          dto.mot_de_passe.startsWith('$2b$') ||
          dto.mot_de_passe.startsWith('$2y$');
        existingId.mot_de_passe = isAlreadyHashed
          ? dto.mot_de_passe
          : await bcrypt.hash(dto.mot_de_passe.trim(), 10);
      }
      const savedExisting = await this.clientRepository.save(existingId);
      return this.toClientResponse(savedExisting);
    }

    const existingCode = await this.clientRepository.findOneBy({
      code_client: codeClient,
    });
    if (existingCode) {
      throw new ConflictException('Ce code client existe deja');
    }

    const isAlreadyHashed =
      dto.mot_de_passe &&
      (dto.mot_de_passe.startsWith('$2a$') ||
        dto.mot_de_passe.startsWith('$2b$') ||
        dto.mot_de_passe.startsWith('$2y$'));

    const mot_de_passe = dto.mot_de_passe
      ? isAlreadyHashed
        ? dto.mot_de_passe
        : await bcrypt.hash(dto.mot_de_passe.trim(), 10)
      : undefined;

    const client = this.clientRepository.create({
      idclient,
      code_client: codeClient,
      nom: dto.nom.trim().toUpperCase(),
      prenom: dto.prenom?.trim(),
      piece_identite: dto.piece_identite.trim(),
      num_piece_identite: dto.num_piece_identite.trim(),
      adresse: dto.adresse.trim(),
      code_postal: dto.code_postal.trim(),
      ville: dto.ville.trim(),
      email: dto.email?.trim().toLowerCase(),
      telephone_principal: dto.telephone_principal?.trim(),
      mot_de_passe,
      idag: dto.idag,
    });

    const saved = await this.clientRepository.save(client);
    return this.toClientResponse(saved);
  }

  async updateClient(idclient: number, dto: UpdateAdminClientDto) {
    const client = await this.clientRepository.findOneBy({ idclient });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    if (dto.code_client !== undefined) {
      const codeClient = dto.code_client.trim();
      const existingCode = await this.clientRepository.findOneBy({
        code_client: codeClient,
      });
      if (existingCode && existingCode.idclient !== idclient) {
        throw new ConflictException('Ce code client existe deja');
      }
    }

    if (dto.idag !== undefined) {
      const agence = await this.agenceRepository.findOneBy({ idag: dto.idag });
      if (!agence) {
        throw new NotFoundException('Agence introuvable pour ce client');
      }
    }

    const updatePayload: Partial<Client> = {};
    if (dto.code_client !== undefined) {
      updatePayload.code_client = dto.code_client.trim();
    }
    if (dto.nom !== undefined) updatePayload.nom = dto.nom.trim().toUpperCase();
    if (dto.prenom !== undefined) updatePayload.prenom = dto.prenom.trim();
    if (dto.piece_identite !== undefined) {
      updatePayload.piece_identite = dto.piece_identite.trim();
    }
    if (dto.num_piece_identite !== undefined) {
      updatePayload.num_piece_identite = dto.num_piece_identite.trim();
    }
    if (dto.adresse !== undefined) updatePayload.adresse = dto.adresse.trim();
    if (dto.code_postal !== undefined) {
      updatePayload.code_postal = dto.code_postal.trim();
    }
    if (dto.ville !== undefined) updatePayload.ville = dto.ville.trim();
    if (dto.email !== undefined)
      updatePayload.email = dto.email.trim().toLowerCase();
    if (dto.telephone_principal !== undefined) {
      updatePayload.telephone_principal = dto.telephone_principal.trim();
    }
    if (dto.mot_de_passe !== undefined) {
      const isAlreadyHashed =
        dto.mot_de_passe.startsWith('$2a$') ||
        dto.mot_de_passe.startsWith('$2b$') ||
        dto.mot_de_passe.startsWith('$2y$');
      updatePayload.mot_de_passe = isAlreadyHashed
        ? dto.mot_de_passe
        : await bcrypt.hash(dto.mot_de_passe.trim(), 10);
    }
    if (dto.idag !== undefined) updatePayload.idag = dto.idag;

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestException('Aucune donnee a mettre a jour');
    }

    await this.clientRepository.update({ idclient }, updatePayload);
    return this.findClientById(idclient);
  }

  async removeClient(idclient: number) {
    const client = await this.clientRepository.findOneBy({ idclient });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    const comptesCount = await this.compteRepository.count({
      where: { idclient },
    });
    if (comptesCount > 0) {
      throw new BadRequestException(
        'Suppression impossible: ce client possede encore des comptes',
      );
    }

    await this.clientRepository.delete({ idclient });
    return { success: true, idclient };
  }

  findTypecomptes() {
    return this.typecompteRepository.find({ order: { idtype: 'ASC' } });
  }

  findPreouverturesTampon(status?: string) {
    return this.preouvertureTamponRepository.find({
      where: status ? { statut_validation: status } : undefined,
      order: { created_at: 'DESC' },
    });
  }

  findOuverturesCompteTampon(status?: string) {
    return this.ouvertureTamponRepository.find({
      where: status ? { statut_validation: status } : undefined,
      order: { created_at: 'DESC' },
    });
  }

  async updatePreouvertureTamponStatus(
    id: number,
    payload: { statut_validation?: string; message_validation?: string },
  ) {
    const demande = await this.preouvertureTamponRepository.findOneBy({ id });
    if (!demande) {
      throw new NotFoundException('Preouverture tampon introuvable');
    }
    this.assertPaymentAllowsAdministrativeValidation(
      demande.statut_validation,
      payload.statut_validation,
    );
    demande.statut_validation =
      payload.statut_validation ?? demande.statut_validation;
    demande.message_validation =
      payload.message_validation ?? demande.message_validation;
    demande.updated_at = new Date();
    return this.preouvertureTamponRepository.save(demande);
  }

  async updateOuvertureCompteTamponStatus(
    id: number,
    payload: { statut_validation?: string; message_validation?: string },
  ) {
    const demande = await this.ouvertureTamponRepository.findOneBy({ id });
    if (!demande) {
      throw new NotFoundException('Ouverture compte tampon introuvable');
    }
    this.assertPaymentAllowsAdministrativeValidation(
      demande.statut_validation,
      payload.statut_validation,
    );
    demande.statut_validation =
      payload.statut_validation ?? demande.statut_validation;
    demande.message_validation =
      payload.message_validation ?? demande.message_validation;
    demande.updated_at = new Date();
    return this.ouvertureTamponRepository.save(demande);
  }

  private assertPaymentAllowsAdministrativeValidation(
    currentStatus: string,
    requestedStatus?: string,
  ) {
    if (currentStatus !== 'payment_pending' || !requestedStatus) return;
    const allowedWhilePending = new Set([
      'payment_pending',
      'payment_failed',
      'rejected',
      'refused',
      'annulee',
    ]);
    if (!allowedWhilePending.has(requestedStatus.trim().toLowerCase())) {
      throw new BadRequestException(
        'Validation impossible: le paiement operateur n est pas encore confirme.',
      );
    }
  }

  async findTypecompteById(idtype: number) {
    const typecompte = await this.typecompteRepository.findOneBy({ idtype });
    if (!typecompte) {
      throw new NotFoundException('Type de compte introuvable');
    }
    return typecompte;
  }

  async createTypecompte(dto: CreateAdminTypecompteDto) {
    const idtype =
      dto.idtype ?? (await this.nextId(this.typecompteRepository, 'idtype'));
    const existing = await this.typecompteRepository.findOneBy({ idtype });
    if (existing) {
      existing.libelle = dto.libelle.trim();
      existing.description = dto.description?.trim();
      existing.taux_interet = this.toDecimalString(dto.taux_interet, 2, 0);
      existing.frais_tenue_compte = this.toDecimalString(
        dto.frais_tenue_compte,
        2,
        0,
      );
      existing.plafond =
        dto.plafond !== undefined
          ? this.toDecimalString(dto.plafond, 2)
          : undefined;
      existing.frais_ouverture = dto.frais_ouverture;
      existing.frais_retrait = dto.frais_retrait;
      existing.code_type = dto.code_type?.trim();
      existing.idcategorie = dto.idcategorie ?? 1;
      existing.numero = dto.numero ?? 1;
      existing.type = dto.type ?? '1';
      existing.mobile_sync_enabled = dto.mobile_sync_enabled ?? 0;
      existing.mobile_can_open = dto.mobile_can_open ?? 0;
      existing.mobile_can_view = dto.mobile_can_view ?? 1;
      existing.mobile_can_deposit = dto.mobile_can_deposit ?? 1;
      return this.typecompteRepository.save(existing);
    }

    const typecompte = this.typecompteRepository.create({
      idtype,
      libelle: dto.libelle.trim(),
      description: dto.description?.trim(),
      taux_interet: this.toDecimalString(dto.taux_interet, 2, 0),
      frais_tenue_compte: this.toDecimalString(dto.frais_tenue_compte, 2, 0),
      plafond:
        dto.plafond !== undefined
          ? this.toDecimalString(dto.plafond, 2)
          : undefined,
      frais_ouverture: dto.frais_ouverture,
      frais_retrait: dto.frais_retrait,
      code_type: dto.code_type?.trim(),
      idcategorie: dto.idcategorie ?? 1,
      numero: dto.numero ?? 1,
      type: dto.type ?? '1',
      mobile_sync_enabled: dto.mobile_sync_enabled ?? 0,
      mobile_can_open: dto.mobile_can_open ?? 0,
      mobile_can_view: dto.mobile_can_view ?? 1,
      mobile_can_deposit: dto.mobile_can_deposit ?? 1,
    });

    return this.typecompteRepository.save(typecompte);
  }

  async updateTypecompte(idtype: number, dto: UpdateAdminTypecompteDto) {
    const typecompte = await this.typecompteRepository.findOneBy({ idtype });
    if (!typecompte) {
      throw new NotFoundException('Type de compte introuvable');
    }

    const updatePayload: Partial<Typecompte> = {};
    if (dto.libelle !== undefined) updatePayload.libelle = dto.libelle.trim();
    if (dto.description !== undefined)
      updatePayload.description = dto.description.trim();
    if (dto.taux_interet !== undefined) {
      updatePayload.taux_interet = this.toDecimalString(dto.taux_interet, 2, 0);
    }
    if (dto.frais_tenue_compte !== undefined) {
      updatePayload.frais_tenue_compte = this.toDecimalString(
        dto.frais_tenue_compte,
        2,
        0,
      );
    }
    if (dto.plafond !== undefined) {
      updatePayload.plafond = this.toDecimalString(dto.plafond, 2);
    }
    if (dto.frais_ouverture !== undefined) {
      updatePayload.frais_ouverture = dto.frais_ouverture;
    }
    if (dto.frais_retrait !== undefined) {
      updatePayload.frais_retrait = dto.frais_retrait;
    }
    if (dto.code_type !== undefined)
      updatePayload.code_type = dto.code_type.trim();
    if (dto.idcategorie !== undefined)
      updatePayload.idcategorie = dto.idcategorie;
    if (dto.numero !== undefined) updatePayload.numero = dto.numero;
    if (dto.type !== undefined) updatePayload.type = dto.type;
    if (dto.mobile_sync_enabled !== undefined) {
      updatePayload.mobile_sync_enabled = dto.mobile_sync_enabled;
    }
    if (dto.mobile_can_open !== undefined) {
      updatePayload.mobile_can_open = dto.mobile_can_open;
    }
    if (dto.mobile_can_view !== undefined) {
      updatePayload.mobile_can_view = dto.mobile_can_view;
    }
    if (dto.mobile_can_deposit !== undefined) {
      updatePayload.mobile_can_deposit = dto.mobile_can_deposit;
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestException('Aucune donnee a mettre a jour');
    }

    await this.typecompteRepository.update({ idtype }, updatePayload);
    return this.findTypecompteById(idtype);
  }

  async removeTypecompte(idtype: number) {
    const typecompte = await this.typecompteRepository.findOneBy({ idtype });
    if (!typecompte) {
      throw new NotFoundException('Type de compte introuvable');
    }

    const comptesCount = await this.compteRepository.count({
      where: { idtype },
    });
    if (comptesCount > 0) {
      throw new BadRequestException(
        'Suppression impossible: ce type de compte est utilise par des comptes',
      );
    }

    await this.typecompteRepository.delete({ idtype });
    return { success: true, idtype };
  }

  async createCompteForAgence(idag: number, dto: CreateAgenceCompteDto) {
    const agence = await this.agenceRepository.findOneBy({ idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable');
    }

    const typecompte = await this.typecompteRepository.findOneBy({
      idtype: dto.idtype,
    });
    if (!typecompte) {
      throw new NotFoundException('Type de compte introuvable');
    }

    const idcompte = await this.nextId(this.compteRepository, 'idcompte');
    const numeroCompte =
      dto.numero_compte?.trim() || this.generateNumeroCompte(idag, idcompte);

    const existingNumero = await this.compteRepository.findOneBy({
      numero_compte: numeroCompte,
    });
    if (existingNumero) {
      throw new ConflictException('Ce numero de compte existe deja');
    }

    const compte = this.compteRepository.create({
      idcompte,
      idag,
      idclient: undefined,
      idtype: dto.idtype,
      solde: (dto.solde_initial ?? 0).toFixed(2),
      numero_compte: numeroCompte,
      pin_code: await this.hashPin(dto.pin_code),
    });

    const saved = await this.compteRepository.save(compte);
    return this.toCompteResponse(saved);
  }

  async findComptesByAgence(idag: number) {
    await this.findAgenceById(idag);
    const comptes = await this.compteRepository
      .createQueryBuilder('compte')
      .where('compte.idag = :idag', { idag })
      .andWhere('compte.idclient IS NULL')
      .orderBy('compte.idcompte', 'ASC')
      .getMany();

    return comptes.map((compte) => this.toCompteResponse(compte));
  }

  async updateCompteForAgence(
    idag: number,
    idcompte: number,
    dto: UpdateAgenceCompteDto,
  ) {
    const compte = await this.findAgenceCompteByIdOrFail(idag, idcompte);
    if (!compte) {
      throw new NotFoundException(
        "Compte d'agence introuvable pour cette agence",
      );
    }

    const updatePayload: Partial<Compte> = {};

    if (dto.idtype !== undefined) updatePayload.idtype = dto.idtype;

    if (dto.idtype !== undefined) {
      const typecompte = await this.typecompteRepository.findOneBy({
        idtype: dto.idtype,
      });
      if (!typecompte) {
        throw new NotFoundException('Type de compte introuvable');
      }
    }

    if (dto.solde !== undefined) updatePayload.solde = dto.solde.toFixed(2);
    if (dto.numero_compte !== undefined) {
      const numeroCompte = dto.numero_compte.trim();
      const existingNumero = await this.compteRepository.findOneBy({
        numero_compte: numeroCompte,
      });
      if (existingNumero && existingNumero.idcompte !== idcompte) {
        throw new ConflictException('Ce numero de compte existe deja');
      }
      updatePayload.numero_compte = numeroCompte;
    }
    if (dto.pin_code !== undefined) {
      updatePayload.pin_code = await this.hashPin(dto.pin_code);
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestException('Aucune donnee a mettre a jour');
    }

    await this.compteRepository.update({ idcompte, idag }, updatePayload);
    const updated = await this.findAgenceCompteByIdOrFail(idag, idcompte);

    if (!updated) {
      throw new NotFoundException(
        "Compte d'agence introuvable apres mise a jour",
      );
    }

    return this.toCompteResponse(updated);
  }

  async removeCompteForAgence(idag: number, idcompte: number) {
    await this.findAgenceCompteByIdOrFail(idag, idcompte);
    await this.compteRepository.delete({ idcompte, idag });

    return { success: true, idcompte, idag };
  }

  async createCompteForClient(idclient: number, dto: CreateClientCompteDto) {
    const client = await this.findClientEntityByIdOrFail(idclient);

    const typecompte = await this.typecompteRepository.findOneBy({
      idtype: dto.idtype,
    });
    if (!typecompte) {
      throw new NotFoundException('Type de compte introuvable');
    }

    const idag = dto.idag ?? client.idag;
    if (!idag) {
      throw new BadRequestException(
        'Agence obligatoire: ce client nest rattache a aucune agence',
      );
    }

    const agence = await this.agenceRepository.findOneBy({ idag });
    if (!agence) {
      throw new NotFoundException('Agence introuvable pour ce compte client');
    }

    const idcompte =
      dto.idcompte ?? (await this.nextId(this.compteRepository, 'idcompte'));
    const numeroCompte =
      dto.numero_compte?.trim() ||
      this.generateClientNumeroCompte(idag, idclient, idcompte);

    const existingId = await this.compteRepository.findOneBy({ idcompte });
    if (existingId) {
      if (existingId.idclient !== idclient) {
        throw new ConflictException('Cet identifiant compte existe deja');
      }

      const existingNumeroForOtherCompte =
        await this.compteRepository.findOneBy({
          numero_compte: numeroCompte,
        });
      if (
        existingNumeroForOtherCompte &&
        existingNumeroForOtherCompte.idcompte !== idcompte
      ) {
        throw new ConflictException('Ce numero de compte existe deja');
      }

      existingId.idag = idag;
      existingId.idtype = dto.idtype;
      existingId.solde = (
        dto.solde_initial ?? Number(existingId.solde ?? 0)
      ).toFixed(2);
      existingId.numero_compte = numeroCompte;
      if (dto.pin_code) {
        existingId.pin_code = await this.hashPin(dto.pin_code);
      }
      const savedExisting = await this.compteRepository.save(existingId);
      return this.toCompteResponse(savedExisting);
    }

    const existingNumero = await this.compteRepository.findOneBy({
      numero_compte: numeroCompte,
    });
    if (existingNumero) {
      throw new ConflictException('Ce numero de compte existe deja');
    }

    const compte = this.compteRepository.create({
      idcompte,
      idag,
      idclient,
      idtype: dto.idtype,
      solde: (dto.solde_initial ?? 0).toFixed(2),
      numero_compte: numeroCompte,
      pin_code: dto.pin_code ? await this.hashPin(dto.pin_code) : null,
    });

    const saved = await this.compteRepository.save(compte);

    if (dto.solde_initial !== undefined && dto.solde_initial > 0) {
      try {
        const formatted = new Intl.NumberFormat('fr-FR').format(
          Math.round(dto.solde_initial),
        );
        const notification = this.notificationRepository.create({
          idclient,
          titre: 'Versement synchronise',
          message: `Votre nouveau compte ${numeroCompte} a ete credite d'un versement initial de ${formatted} XAF (Synchronisation caisse/collecte).`,
          type: 'versement',
          lu: 0,
        });
        await this.notificationRepository.save(notification);
      } catch (err) {
        console.error(
          'Failed to create initial balance sync notification:',
          err,
        );
      }
    }

    return this.toCompteResponse(saved);
  }

  async findComptesByClient(idclient: number) {
    await this.findClientEntityByIdOrFail(idclient);
    const comptes = await this.compteRepository
      .createQueryBuilder('compte')
      .where('compte.idclient = :idclient', { idclient })
      .orderBy('compte.idcompte', 'ASC')
      .getMany();

    return comptes.map((compte) => this.toCompteResponse(compte));
  }

  async updateCompteForClient(
    idclient: number,
    idcompte: number,
    dto: UpdateClientCompteDto,
  ) {
    const compte = await this.findClientCompteByIdOrFail(idclient, idcompte);

    const updatePayload: Partial<Compte> = {};

    if (dto.idtype !== undefined) {
      const typecompte = await this.typecompteRepository.findOneBy({
        idtype: dto.idtype,
      });
      if (!typecompte) {
        throw new NotFoundException('Type de compte introuvable');
      }
      updatePayload.idtype = dto.idtype;
    }

    let isVersementSync = false;
    let syncDiff = 0;
    if (dto.solde !== undefined) {
      const oldSolde = parseFloat(compte.solde ?? '0');
      const newSolde = parseFloat(dto.solde.toFixed(2));
      if (newSolde > oldSolde) {
        isVersementSync = true;
        syncDiff = newSolde - oldSolde;
      }
      updatePayload.solde = dto.solde.toFixed(2);
    }

    if (dto.numero_compte !== undefined) {
      const numeroCompte = dto.numero_compte.trim();
      const existingNumero = await this.compteRepository.findOneBy({
        numero_compte: numeroCompte,
      });
      if (existingNumero && existingNumero.idcompte !== idcompte) {
        throw new ConflictException('Ce numero de compte existe deja');
      }
      updatePayload.numero_compte = numeroCompte;
    }

    if (dto.pin_code !== undefined) {
      updatePayload.pin_code = await this.hashPin(dto.pin_code);
    }

    if (dto.idag !== undefined) {
      const agence = await this.agenceRepository.findOneBy({ idag: dto.idag });
      if (!agence) {
        throw new NotFoundException('Agence introuvable pour ce compte client');
      }
      updatePayload.idag = dto.idag;
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new BadRequestException('Aucune donnee a mettre a jour');
    }

    await this.compteRepository.update({ idcompte, idclient }, updatePayload);
    const updated = await this.findClientCompteByIdOrFail(idclient, idcompte);

    if (!updated) {
      throw new NotFoundException(
        'Compte client introuvable apres mise a jour',
      );
    }

    if (isVersementSync && syncDiff > 0) {
      try {
        const formatted = new Intl.NumberFormat('fr-FR').format(
          Math.round(syncDiff),
        );
        const notification = this.notificationRepository.create({
          idclient,
          titre: 'Versement synchronise',
          message: `Votre compte ${compte.numero_compte} a ete credite d'un versement de ${formatted} XAF (Synchronisation caisse/collecte).`,
          type: 'versement',
          lu: 0,
        });
        await this.notificationRepository.save(notification);
      } catch (err) {
        console.error('Failed to create balance sync notification:', err);
      }
    }

    return this.toCompteResponse(updated);
  }

  async removeCompteForClient(idclient: number, idcompte: number) {
    await this.findClientCompteByIdOrFail(idclient, idcompte);
    await this.compteRepository.delete({ idcompte, idclient });

    return { success: true, idcompte, idclient };
  }

  async resetComptePinForClient(idclient: number, idcompte: number) {
    const compte = await this.findClientCompteByIdOrFail(idclient, idcompte);

    await this.compteRepository.update(
      { idcompte, idclient },
      { pin_code: null },
    );

    const updated = await this.findClientCompteByIdOrFail(idclient, idcompte);
    return {
      success: true,
      message:
        'Code PIN reinitialise. Le client peut configurer un nouveau code PIN.',
      compte: updated
        ? this.toCompteResponse(updated)
        : this.toCompteResponse(compte),
    };
  }

  async getDepositStatsByClient(limit = 10) {
    const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 10));
    const rows = await this.transactionRepository
      .createQueryBuilder('t')
      .innerJoin(Compte, 'c', 'c.idcompte = t.idcompte')
      .innerJoin(Client, 'cl', 'cl.idclient = c.idclient')
      .select('cl.idclient', 'idclient')
      .addSelect("CONCAT(cl.nom, ' ', COALESCE(cl.prenom, ''))", 'client')
      .addSelect('COUNT(t.idtransaction)', 'totalDeposits')
      .addSelect('COALESCE(SUM(t.montant_transaction), 0)', 'totalAmount')
      .where("t.type_transaction = 'versement'")
      .andWhere("t.statut = 'complete'")
      .groupBy('cl.idclient')
      .addGroupBy('cl.nom')
      .addGroupBy('cl.prenom')
      .orderBy('totalAmount', 'DESC')
      .limit(normalizedLimit)
      .getRawMany<{
        idclient: string;
        client: string;
        totalDeposits: string;
        totalAmount: string;
      }>();

    return rows.map((row) => ({
      idclient: Number(row.idclient),
      client: String(row.client || '').trim() || `Client #${row.idclient}`,
      totalDeposits: Number(row.totalDeposits || 0),
      totalAmount: Number(row.totalAmount || 0),
    }));
  }

  async getDepositStatsByOperator() {
    let rows: Array<{
      operateur: string;
      totalDeposits: string;
      totalAmount: string;
    }> = [];

    try {
      rows = await this.transactionRepository
        .createQueryBuilder('t')
        .select(
          "COALESCE(NULLIF(TRIM(t.operateur), ''), 'inconnu')",
          'operateur',
        )
        .addSelect('COUNT(t.idtransaction)', 'totalDeposits')
        .addSelect('COALESCE(SUM(t.montant_transaction), 0)', 'totalAmount')
        .where("t.type_transaction = 'versement'")
        .andWhere("t.statut = 'complete'")
        .groupBy("COALESCE(NULLIF(TRIM(t.operateur), ''), 'inconnu')")
        .orderBy('totalAmount', 'DESC')
        .getRawMany<{
          operateur: string;
          totalDeposits: string;
          totalAmount: string;
        }>();
    } catch (error) {
      const mysqlCode = (error as { code?: string })?.code;
      const looksLikeMissingOperateurColumn =
        error instanceof QueryFailedError &&
        (mysqlCode === 'ER_BAD_FIELD_ERROR' ||
          String((error as Error).message || '')
            .toLowerCase()
            .includes('operateur'));

      // Backward compatibility when DB migration for transaction.operateur is not yet applied.
      if (!looksLikeMissingOperateurColumn) {
        throw error;
      }

      rows = await this.transactionRepository
        .createQueryBuilder('t')
        .select("'inconnu'", 'operateur')
        .addSelect('COUNT(t.idtransaction)', 'totalDeposits')
        .addSelect('COALESCE(SUM(t.montant_transaction), 0)', 'totalAmount')
        .where("t.type_transaction = 'versement'")
        .andWhere("t.statut = 'complete'")
        .getRawMany<{
          operateur: string;
          totalDeposits: string;
          totalAmount: string;
        }>();
    }

    return rows.map((row) => ({
      operateur: row.operateur,
      totalDeposits: Number(row.totalDeposits || 0),
      totalAmount: Number(row.totalAmount || 0),
    }));
  }

  async getSettingsOperators() {
    await this.ensureOperatorSettingsStorage();
    const operators = await this.readOperatorCatalogue();
    const activeCodes = await this.readActiveOperatorCodes();

    return operators
      .map((operator) => ({
        nom: operator.nom,
        code: operator.code,
        idtype: operator.idtype,
        idcompte: operator.idcompte,
        idtype_credit: operator.idtype_credit,
        idtype_debit: operator.idtype_debit,
        idcompte_credit: operator.idcompte_credit,
        idcompte_debit: operator.idcompte_debit,
        actif: activeCodes.has(operator.code),
        date_creation: operator.date_creation,
      }))
      .sort((a, b) => a.nom.localeCompare(b.nom));
  }

  async createSettingsOperator(dto: CreateAdminOperatorDto) {
    await this.ensureOperatorSettingsStorage();
    const operators = await this.readOperatorCatalogue();
    const code = this.normalizeOperatorCode(dto.code);

    if (operators.some((operator) => operator.code === code)) {
      throw new ConflictException('Ce code operateur existe deja');
    }

    const idtypeCredit =
      dto.idtype_credit ?? dto.idtype ?? this.defaultOperatorTypeFallbackId;
    const idtypeDebit =
      dto.idtype_debit ?? dto.idtype ?? this.defaultOperatorTypeFallbackId;

    const operator = {
      nom: dto.nom.trim(),
      code,
      idtype: idtypeCredit,
      idcompte: undefined,
      idtype_credit: idtypeCredit,
      idtype_debit: idtypeDebit,
      idcompte_credit: undefined,
      idcompte_debit: undefined,
      date_creation: new Date().toISOString(),
    };

    operators.push(operator);
    await this.writeOperatorCatalogue(operators);

    const shouldActivate = dto.actif ?? true;
    if (shouldActivate) {
      await this.updateActiveOperator(code, true, {
        idtypecompte: operator.idtype_credit,
        idcompte: operator.idcompte_credit,
        idtype_credit: operator.idtype_credit,
        idtype_debit: operator.idtype_debit,
        idcompte_credit: operator.idcompte_credit,
        idcompte_debit: operator.idcompte_debit,
      });
    }

    return {
      ...operator,
      actif: shouldActivate,
    };
  }

  async updateSettingsOperatorActivation(
    code: string,
    dto: UpdateAdminOperatorActivationDto,
  ) {
    await this.ensureOperatorSettingsStorage();
    const normalizedCode = this.normalizeOperatorCode(code);
    const operators = await this.readOperatorCatalogue();
    const operator = operators.find((item) => item.code === normalizedCode);

    if (!operator) {
      throw new NotFoundException('Operateur introuvable');
    }

    const updatedOperator = { ...operator };
    if (dto.nom !== undefined) {
      updatedOperator.nom = dto.nom.trim();
    }

    if (dto.idtype_credit !== undefined) {
      updatedOperator.idtype_credit = dto.idtype_credit;
      updatedOperator.idtype = dto.idtype_credit;
    }

    if (dto.idtype_debit !== undefined) {
      updatedOperator.idtype_debit = dto.idtype_debit;
    }

    const nextCatalogue = operators.map((item) =>
      item.code === normalizedCode ? updatedOperator : item,
    );
    await this.writeOperatorCatalogue(nextCatalogue);

    const activeCodes = await this.readActiveOperatorCodes();
    const shouldBeActive = dto.actif ?? activeCodes.has(normalizedCode);
    await this.updateActiveOperator(normalizedCode, shouldBeActive, {
      idtypecompte:
        updatedOperator.idtype_credit ?? this.defaultOperatorTypeFallbackId,
      idcompte: updatedOperator.idcompte_credit,
      idtype_credit: updatedOperator.idtype_credit,
      idtype_debit: updatedOperator.idtype_debit,
      idcompte_credit: updatedOperator.idcompte_credit,
      idcompte_debit: updatedOperator.idcompte_debit,
    });
    const nextOperators = await this.getSettingsOperators();
    return nextOperators.find((operator) => operator.code === normalizedCode);
  }

  async getSettingsApps() {
    await this.ensureAppStorage();
    const apps = await this.appRepository.find({ order: { idapp: 'ASC' } });

    return apps.map((app) => ({
      idapp: app.idapp,
      nom_app: app.nom_app,
      api_key: app.api_key,
      secret_key: app.secret_key,
      date_creation: app.date_creation,
      date_modification: app.date_modification,
    }));
  }

  async createSettingsApp(dto: CreateAdminAppDto) {
    await this.ensureAppStorage();

    const idapp = await this.nextId(this.appRepository, 'idapp');
    const api_key = await this.generateUniqueApiKey();
    const secret_key = this.generateSecretKey();

    const app = this.appRepository.create({
      idapp,
      nom_app: dto.nom_app.trim(),
      api_key,
      secret_key,
    });

    return this.appRepository.save(app);
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

  private generateClientNumeroCompte(
    idag: number,
    idclient: number,
    idcompte: number,
  ) {
    const stamp = Date.now().toString().slice(-5);
    return `CL${String(idag).padStart(3, '0')}${String(idclient).padStart(6, '0')}${stamp}${String(idcompte).padStart(3, '0')}`;
  }

  private generateClientCode(idclient: number) {
    return `CLT${String(idclient).padStart(6, '0')}`;
  }

  private generateOperatorNumeroCompte(
    operatorCode: string,
    idcompte: number,
    role = 'gestion',
  ) {
    const stamp = Date.now().toString().slice(-6);
    const normalizedCode = this.normalizeOperatorCode(operatorCode)
      .toUpperCase()
      .slice(0, 4)
      .padEnd(2, 'X');
    const roleCode = role.toUpperCase().slice(0, 1) || 'G';
    return `OP${normalizedCode}${roleCode}${stamp}${String(idcompte).padStart(4, '0')}`;
  }

  private async assertTypecompteExists(idtype: number) {
    const typecompte = await this.typecompteRepository.findOneBy({ idtype });
    if (!typecompte) {
      throw new NotFoundException('Type de compte introuvable');
    }
    return typecompte;
  }

  private async createOperatorGestionCompte(
    operatorCode: string,
    idtype: number,
    role: 'credit' | 'debit',
  ) {
    const idcompte = await this.nextId(this.compteRepository, 'idcompte');
    const numero_compte = this.generateOperatorNumeroCompte(
      operatorCode,
      idcompte,
      role,
    );
    const existingNumero = await this.compteRepository.findOneBy({
      numero_compte,
    });
    if (existingNumero) {
      throw new ConflictException(
        'Impossible de creer le compte de gestion: numero deja utilise',
      );
    }

    const compteGestion = this.compteRepository.create({
      idcompte,
      idtype,
      solde: '0.00',
      numero_compte,
      idclient: undefined,
      idag: undefined,
      pin_code: undefined,
    });
    return this.compteRepository.save(compteGestion);
  }

  private async hashPin(pin?: string) {
    if (!pin) return undefined;
    const normalized = pin.trim();
    if (!/^\d{4,6}$/.test(normalized)) {
      throw new BadRequestException('Le code PIN doit contenir 4 a 6 chiffres');
    }
    return bcrypt.hash(normalized, 10);
  }

  private toDecimalString(value?: number, scale = 2, fallback = 0) {
    if (value === undefined || value === null) {
      return fallback.toFixed(scale);
    }
    return value.toFixed(scale);
  }

  private toClientResponse(client: Client) {
    const { mot_de_passe: _pwd, ...safeClient } = client;
    return safeClient;
  }

  private async findAgenceCompteByIdOrFail(idag: number, idcompte: number) {
    const compte = await this.compteRepository
      .createQueryBuilder('compte')
      .where('compte.idag = :idag', { idag })
      .andWhere('compte.idcompte = :idcompte', { idcompte })
      .andWhere('compte.idclient IS NULL')
      .getOne();

    if (!compte) {
      throw new NotFoundException(
        "Compte d'agence introuvable pour cette agence",
      );
    }

    return compte;
  }

  private async findClientEntityByIdOrFail(idclient: number) {
    const client = await this.clientRepository.findOneBy({ idclient });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    return client;
  }

  private async findClientCompteByIdOrFail(idclient: number, idcompte: number) {
    const compte = await this.compteRepository
      .createQueryBuilder('compte')
      .where('compte.idclient = :idclient', { idclient })
      .andWhere('compte.idcompte = :idcompte', { idcompte })
      .getOne();

    if (!compte) {
      throw new NotFoundException('Compte client introuvable pour ce client');
    }

    return compte;
  }

  private normalizeOperatorCode(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
  }

  private async ensureOperatorSettingsStorage() {
    await this.listeOperatorRepository.query(`
      CREATE TABLE IF NOT EXISTS liste_operator (
        idliste_operator INT NOT NULL AUTO_INCREMENT,
        liste_operator JSON NOT NULL,
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
        date_modification DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (idliste_operator)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);

    await this.settingRepository.query(`
      CREATE TABLE IF NOT EXISTS setting (
        idsetting INT NOT NULL AUTO_INCREMENT,
        operator_actif JSON NOT NULL,
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
        date_modification DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (idsetting)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);
  }

  private async ensureAppStorage() {
    await this.appRepository.query(`
      CREATE TABLE IF NOT EXISTS app (
        idapp INT NOT NULL AUTO_INCREMENT,
        nom_app VARCHAR(100) NOT NULL,
        api_key VARCHAR(255) NOT NULL UNIQUE,
        secret_key VARCHAR(255) NOT NULL,
        date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
        date_modification DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (idapp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
    `);
  }

  private async generateUniqueApiKey() {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = `ak_${randomBytes(24).toString('hex')}`;
      const exists = await this.appRepository.findOneBy({ api_key: candidate });
      if (!exists) return candidate;
    }

    throw new ConflictException('Impossible de generer une cle unique');
  }

  private generateSecretKey() {
    return `sk_${randomBytes(32).toString('hex')}`;
  }

  private async readOperatorCatalogue() {
    const row = await this.getOrCreateOperatorCatalogueRow();
    const rawList = Array.isArray(row.liste_operator) ? row.liste_operator : [];

    return rawList
      .map((item) => {
        const fallbackType =
          Number(
            item?.idtype ??
              item?.idtypecompte ??
              this.defaultOperatorTypeFallbackId,
          ) || this.defaultOperatorTypeFallbackId;
        const fallbackCompte =
          item?.idcompte !== undefined && item?.idcompte !== null
            ? Number(item.idcompte)
            : undefined;
        const idtypeCredit =
          Number(item?.idtype_credit ?? fallbackType) || fallbackType;
        const idtypeDebit =
          Number(item?.idtype_debit ?? fallbackType) || fallbackType;
        const idcompteCredit =
          item?.idcompte_credit !== undefined && item?.idcompte_credit !== null
            ? Number(item.idcompte_credit)
            : fallbackCompte;
        const idcompteDebit =
          item?.idcompte_debit !== undefined && item?.idcompte_debit !== null
            ? Number(item.idcompte_debit)
            : fallbackCompte;

        return {
          nom: String(item?.nom || '').trim(),
          code: this.normalizeOperatorCode(String(item?.code || '')),
          date_creation: String(item?.date_cration || ''),
          idtype: idtypeCredit,
          idcompte: idcompteCredit,
          idtype_credit: idtypeCredit,
          idtype_debit: idtypeDebit,
          idcompte_credit: idcompteCredit,
          idcompte_debit: idcompteDebit,
        };
      })
      .filter((item) => item.nom && item.code);
  }

  private async writeOperatorCatalogue(
    operators: Array<{
      nom: string;
      code: string;
      idtype: number;
      idcompte?: number;
      idtype_credit?: number;
      idtype_debit?: number;
      idcompte_credit?: number;
      idcompte_debit?: number;
      date_creation?: string;
    }>,
  ) {
    const row = await this.getOrCreateOperatorCatalogueRow();
    row.liste_operator = operators.map((operator) => ({
      nom: operator.nom,
      code: this.normalizeOperatorCode(operator.code),
      idtype: operator.idtype,
      idcompte: operator.idcompte,
      idtype_credit: operator.idtype_credit ?? operator.idtype,
      idtype_debit: operator.idtype_debit ?? operator.idtype,
      idcompte_credit: operator.idcompte_credit ?? operator.idcompte,
      idcompte_debit: operator.idcompte_debit ?? operator.idcompte,
      date_cration: operator.date_creation || new Date().toISOString(),
    }));
    await this.listeOperatorRepository.save(row);
  }

  private async readActiveOperatorCodes() {
    const row = await this.getOrCreateSettingRow();
    const rawList = Array.isArray(row.operator_actif) ? row.operator_actif : [];

    return new Set(
      rawList
        .map((item) =>
          this.normalizeOperatorCode(String(item?.operateur || '')),
        )
        .filter(Boolean),
    );
  }

  private async updateActiveOperator(
    code: string,
    actif: boolean,
    metadata?: {
      idtypecompte?: number;
      idcompte?: number;
      idtype_credit?: number;
      idtype_debit?: number;
      idcompte_credit?: number;
      idcompte_debit?: number;
    },
  ) {
    const normalizedCode = this.normalizeOperatorCode(code);
    const row = await this.getOrCreateSettingRow();
    const current = Array.isArray(row.operator_actif) ? row.operator_actif : [];
    const without = current.filter(
      (item) =>
        this.normalizeOperatorCode(String(item?.operateur || '')) !==
        normalizedCode,
    );

    row.operator_actif = actif
      ? [
          ...without,
          {
            operateur: normalizedCode,
            idtypecompte:
              metadata?.idtypecompte ?? this.defaultOperatorTypeFallbackId,
            idcompte: metadata?.idcompte,
            idtype_credit:
              metadata?.idtype_credit ??
              metadata?.idtypecompte ??
              this.defaultOperatorTypeFallbackId,
            idtype_debit:
              metadata?.idtype_debit ??
              metadata?.idtypecompte ??
              this.defaultOperatorTypeFallbackId,
            idcompte_credit: metadata?.idcompte_credit ?? metadata?.idcompte,
            idcompte_debit: metadata?.idcompte_debit ?? metadata?.idcompte,
          },
        ]
      : without;

    await this.settingRepository.save(row);
  }

  private async getOrCreateOperatorCatalogueRow() {
    const existing = await this.listeOperatorRepository.find({
      order: { idliste_operator: 'DESC' },
      take: 1,
    });
    if (existing.length > 0) return existing[0];

    const idliste_operator = await this.nextId(
      this.listeOperatorRepository,
      'idliste_operator',
    );
    const row = this.listeOperatorRepository.create({
      idliste_operator,
      liste_operator: [],
    });
    return this.listeOperatorRepository.save(row);
  }

  private async getOrCreateSettingRow() {
    const existing = await this.settingRepository.find({
      order: { idsetting: 'DESC' },
      take: 1,
    });
    if (existing.length > 0) return existing[0];

    const idsetting = await this.nextId(this.settingRepository, 'idsetting');
    const row = this.settingRepository.create({
      idsetting,
      operator_actif: [],
    });
    return this.settingRepository.save(row);
  }

  private toCompteResponse(compte: Compte) {
    const { pin_code: _pin, ...safeCompte } = compte;
    return {
      ...safeCompte,
      has_pin: Boolean(_pin),
    };
  }

  private toUserResponse(user: User) {
    const { password: _pwd, ...safeUser } = user;
    return safeUser;
  }
}
