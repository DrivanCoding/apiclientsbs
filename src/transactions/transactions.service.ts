import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
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

  async deposit(dto: DepositDto) {
    return this.dataSource.transaction(async manager => {
      const compte = await manager.findOne(Compte, {
        where: { idcompte: dto.idcompte },
      });

      if (!compte || compte.idclient !== dto.idclient) {
        throw new NotFoundException('Compte introuvable');
      }

      const currentSolde = parseFloat(compte.solde ?? '0');
      const newSolde = currentSolde + dto.montant_transaction;

      const nextIdResult = await manager
        .createQueryBuilder(Transaction, 'transaction')
        .select('MAX(transaction.idtransaction)', 'max')
        .getRawOne<{ max: number }>();

      const nextId = (nextIdResult?.max ?? 0) + 1;

      const transaction = manager.create(Transaction, {
        idtransaction: nextId,
        iduser: dto.iduser ?? SYSTEM_USER_ID,
        idcompte: compte.idcompte,
        montant_transaction: dto.montant_transaction.toFixed(2),
        type_transaction: 'versement',
        statut: 'complete',
        references: dto.references ?? `Collecte mobile ${dto.operateur}`,
        description:
          dto.description ??
          'Collecte mobile via ' + dto.operateur + ' sur ' + dto.numero_telephone,
      });

      const savedTransaction = await manager.save(transaction);

      compte.solde = newSolde.toFixed(2);
      await manager.save(compte);

      return savedTransaction;
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
      const nextTransactionId = await this.nextId(
        manager,
        'transaction',
        'idtransaction',
      );

      const client = manager.create(Client, {
        idclient: nextClientId,
        code_client: this.buildCodeClient(nextClientId),
        nom: dto.nom.trim().toUpperCase(),
        prenom: dto.prenom?.trim(),
        email: dto.email.trim().toLowerCase(),
        telephone_principal: dto.telephone_principal.trim(),
        mot_de_passe: dto.mot_de_passe,
      });
      const savedClient = await manager.save(client);

      const compte = manager.create(Compte, {
        idcompte: nextCompteId,
        idtype,
        solde: dto.montant_initial.toFixed(2),
        idclient: savedClient.idclient,
        idag: dto.idag ?? 1,
        numero_compte: this.buildNumeroCompte(nextCompteId, savedClient.idclient),
      });
      const savedCompte = await manager.save(compte);

      const transaction = manager.create(Transaction, {
        idtransaction: nextTransactionId,
        iduser: SYSTEM_USER_ID,
        idcompte: savedCompte.idcompte,
        montant_transaction: dto.montant_initial.toFixed(2),
        type_transaction: 'versement',
        statut: 'complete',
        references,
        description,
      });
      const savedTransaction = await manager.save(transaction);

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
      ['momo', 'mtn', 'mtn momo', 'mobile money', 'mobilemoney'].includes(
        normalized,
      )
    ) {
      return 'momo';
    }
    throw new BadRequestException('Operateur invalide. Utilisez om ou momo');
  }

  private resolveTypeCompte(value?: string): number {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return 1;
    if (normalized.includes('collecte')) return 1;
    if (normalized.includes('epargne')) return 2;
    return 1;
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

  private buildCodeClient(id: number) {
    return `C-${String(id).padStart(4, '0')}`;
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
}
