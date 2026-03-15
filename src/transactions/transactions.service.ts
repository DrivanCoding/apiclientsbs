import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { Notification } from '../entities/notification.entity';
import { Transaction } from '../entities/transaction.entity';
import { PaynoteService } from '../paynote/paynote.service';
import { DepositDto } from './dto/deposit.dto';
import { PreouvertureDto } from './dto/preouverture.dto';

const SYSTEM_USER_ID = 1;

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repository: Repository<Transaction>,
    @InjectRepository(Compte)
    private readonly compteRepository: Repository<Compte>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    private readonly dataSource: DataSource,
    private readonly paynoteService: PaynoteService,
  ) {}

  create(payload: Partial<Transaction>) {
    return this.repository.save(payload);
  }

  findAll() {
    return this.repository.find();
  }

  findOne(id: number) {
    return this.repository.findOneBy({ idtransaction: id });
  }

  update(id: number, payload: Partial<Transaction>) {
    return this.repository.update(id, payload);
  }

  remove(id: number) {
    return this.repository.delete(id);
  }

  async deposit(dto: DepositDto, authenticatedClientId: number) {
    if (!authenticatedClientId) {
      throw new UnauthorizedException('Utilisateur non authentifie');
    }

    if (dto.idclient && Number(dto.idclient) !== authenticatedClientId) {
      throw new UnauthorizedException('Client invalide pour cette collecte');
    }

    const effectiveClientId = authenticatedClientId;
    const normalizedOperator = this.normalizeOperator(dto.operateur);
    const references =
      dto.references?.trim() ||
      `COLL-${Date.now()}-${Math.floor(Math.random() * 10000)
        .toString()
        .padStart(4, '0')}`;
    const description =
      dto.description?.trim() ||
      `Collecte mobile ${normalizedOperator.toUpperCase()} sur ${dto.numero_telephone}`;

    const payment = await this.collectWithPaynote({
      operateur: normalizedOperator,
      numeroTelephone: dto.numero_telephone,
      montant: dto.montant_transaction,
      references,
      description,
    });
    if (!this.isPaymentSuccessful(payment)) {
      throw new BadGatewayException('Paiement non confirme par Paynote');
    }

    return this.dataSource.transaction(async manager => {
      const compte = await manager.findOne(Compte, {
        where: { idcompte: dto.idcompte },
      });

      if (!compte || compte.idclient !== effectiveClientId) {
        throw new NotFoundException('Compte introuvable');
      }

      const currentSolde = parseFloat(compte.solde ?? '0');
      const newSolde = currentSolde + dto.montant_transaction;

      const transaction = manager.create(Transaction, {
        iduser: dto.iduser ?? SYSTEM_USER_ID,
        idcompte: compte.idcompte,
        montant_transaction: dto.montant_transaction.toFixed(2),
        type_transaction: 'versement',
        statut: 'complete',
        references,
        description,
      });

      const savedTransaction = await manager.save(transaction);

      compte.solde = newSolde.toFixed(2);
      await manager.save(compte);

      const notification = manager.create(Notification, {
        idclient: effectiveClientId,
        titre: 'Versement reussi',
        message: this.buildDepositNotificationMessage({
          amount: dto.montant_transaction,
          numeroCompte: compte.numero_compte,
        }),
        type: 'versement',
        lu: 0,
      });
      await manager.save(notification);

      return {
        message: 'Collecte enregistree',
        transaction: savedTransaction,
        payment,
      };
    });
  }

  async findByClient(idclient: number) {
    return this.repository
      .createQueryBuilder('transaction')
      .innerJoin(Compte, 'compte', 'compte.idcompte = transaction.idcompte')
      .where('compte.idclient = :idclient', { idclient })
      .orderBy('transaction.date_transaction', 'DESC')
      .getMany();
  }

  async preouvertureWithDeposit(dto: PreouvertureDto) {
    const normalizedOperator = this.normalizeOperator(dto.operateur);
    const idtype = dto.idtype ?? this.resolveTypeCompte(dto.type_compte);
    const references = dto.references?.trim() || this.buildOrderId();
    const description =
      dto.description?.trim() ||
      `Depot initial ${normalizedOperator.toUpperCase()} - ${dto.telephone_principal}`;

    const paynoteResult = await this.collectWithPaynote({
      operateur: normalizedOperator,
      numeroTelephone: dto.telephone_principal,
      montant: dto.montant_initial,
      references,
      description,
    });

    return this.dataSource.transaction(async manager => {
      const nextClientId = await this.nextId(manager, 'clients', 'idclient');
      const nextCompteId = await this.nextId(manager, 'compte', 'idcompte');

      const client = manager.create(Client, {
        idclient: nextClientId,
        code_client: this.buildCodeClient(dto.idag, nextClientId),
        nom: dto.nom.trim().toUpperCase(),
        prenom: dto.prenom?.trim(),
        piece_identite: this.normalizePieceIdentite(dto.type_piece),
        num_piece_identite:
          dto.num_piece_identite?.trim() || `TMP-${Date.now()}`,
        adresse: dto.adresse?.trim() || 'Non renseignee',
        code_postal: dto.code_postal?.trim() || '0000',
        ville: dto.ville?.trim() || 'Non renseignee',
        email: dto.email.trim().toLowerCase(),
        telephone_principal: dto.telephone_principal.trim(),
        mot_de_passe: dto.mot_de_passe,
        idag: dto.idag,
      });
      const savedClient = await manager.save(client);

      const compte = manager.create(Compte, {
        idcompte: nextCompteId,
        idtype,
        solde: dto.montant_initial.toFixed(2),
        idclient: savedClient.idclient,
        idag: dto.idag,
        numero_compte: this.buildNumeroCompte(nextCompteId, savedClient.idclient),
      });
      const savedCompte = await manager.save(compte);

      const transaction = manager.create(Transaction, {
        iduser: SYSTEM_USER_ID,
        idcompte: savedCompte.idcompte,
        montant_transaction: dto.montant_initial.toFixed(2),
        type_transaction: 'versement',
        statut: 'complete',
        references,
        description,
      });
      const savedTransaction = await manager.save(transaction);

      const notification = manager.create(Notification, {
        idclient: savedClient.idclient,
        titre: 'Versement reussi',
        message: this.buildDepositNotificationMessage({
          amount: dto.montant_initial,
          numeroCompte: savedCompte.numero_compte,
        }),
        type: 'versement',
        lu: 0,
      });
      await manager.save(notification);

      return {
        message: 'Pre-ouverture et depot initial effectues',
        client: savedClient,
        compte: savedCompte,
        transaction: savedTransaction,
        payment: paynoteResult,
      };
    });
  }

  private async collectWithPaynote(payload: {
    operateur: 'om' | 'momo';
    numeroTelephone: string;
    montant: number;
    references: string;
    description: string;
  }) {
    try {
      if (payload.operateur === 'om') {
        const init = await this.paynoteService.initPayment();
        const payToken = init?.data?.payToken;
        if (!payToken) {
          throw new BadGatewayException(
            'Initialisation Orange Money invalide (payToken absent)',
          );
        }
        return this.paynoteService.pay({
          amount: payload.montant,
          subscriberMsisdn: payload.numeroTelephone,
          orderId: payload.references,
          description: payload.description,
          payToken,
        });
      }

      return this.paynoteService.mtnPay({
        amount: payload.montant,
        subscriberMsisdn: payload.numeroTelephone,
        orderId: payload.references,
        description: payload.description,
        paymentMethod: 'MTN_CMR',
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Paiement mobile indisponible';
      throw new BadGatewayException(message);
    }
  }

  private normalizeOperator(value: string): 'om' | 'momo' {
    const normalized = String(value || '').trim().toLowerCase();
    if (['om', 'orange', 'orange money'].includes(normalized)) {
      return 'om';
    }
    if (
      [
        'momo',
        'mtn',
        'mtn momo',
        'mtn mobile money',
        'mobile money',
        'mobilemoney',
      ].includes(normalized)
    ) {
      return 'momo';
    }
    throw new BadRequestException('Operateur invalide. Utilisez om ou momo');
  }

  private isPaymentSuccessful(payment: unknown): boolean {
    const candidates = this.extractStatusCandidates(payment);
    if (candidates.length === 0) return false;

    const successWords = ['success', 'succeeded', 'complete', 'completed', 'ok', 'approved', 'paid'];
    const failedWords = ['fail', 'failed', 'error', 'cancel', 'annule', 'reject', 'declined', 'pending'];

    for (const value of candidates) {
      if (failedWords.some(word => value.includes(word))) {
        return false;
      }
      if (successWords.some(word => value.includes(word))) {
        return true;
      }
    }

    return false;
  }

  private extractStatusCandidates(payload: unknown): string[] {
    const values: string[] = [];
    const walk = (node: unknown) => {
      if (!node) return;
      if (typeof node === 'string') {
        values.push(node.toLowerCase());
        return;
      }
      if (typeof node !== 'object') return;

      const record = node as Record<string, unknown>;
      const keys = ['status', 'statut', 'message', 'code', 'result', 'state'];
      for (const key of keys) {
        const raw = record[key];
        if (typeof raw === 'string') {
          values.push(raw.toLowerCase());
        }
      }

      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          walk(value);
        }
      }
    };

    walk(payload);
    return values;
  }

  private resolveTypeCompte(value?: string): number {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 1;
    if (normalized.includes('collecte')) return 1;
    if (normalized.includes('epargne')) return 2;
    return 1;
  }

  private normalizePieceIdentite(value?: string): string {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'passeport') return 'Passeport';
    if (normalized === 'permis') return 'Permis';
    return 'CNI';
  }

  private async nextId(
    manager: EntityManager,
    table: string,
    column: string,
  ) {
    const rows = await manager.query(
      `SELECT COALESCE(MAX(${column}), 0) + 1 AS nextId FROM ${table}`,
    );
    return Number(rows?.[0]?.nextId || 1);
  }

  private buildCodeClient(idag: number, idclient: number) {
    const agencePart = String(idag).padStart(2, '0').slice(-2);
    const randomPart = Math.floor(Math.random() * 10).toString();
    const clientPart = String(idclient).padStart(5, '0').slice(-5);
    return `CL-${agencePart}${randomPart}${clientPart}`;
  }

  private buildNumeroCompte(idcompte: number, idclient: number) {
    const timestampPart = Date.now().toString().slice(-6);
    return `SB${timestampPart}${String(idclient).padStart(4, '0')}${String(
      idcompte,
    ).padStart(4, '0')}`;
  }

  private buildOrderId() {
    const now = Date.now();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `PRE-${now}-${random}`;
  }

  private buildDepositNotificationMessage(payload: {
    amount: number;
    numeroCompte: string;
  }) {
    const rounded = Math.round(payload.amount);
    const formatted = new Intl.NumberFormat('fr-FR').format(rounded);
    return `Votre versement de ${formatted} XAF sur le compte ${payload.numeroCompte} a ete confirme.`;
  }
}
