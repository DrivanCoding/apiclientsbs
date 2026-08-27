import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { Notification } from '../entities/notification.entity';
import { OuvertureCompteTampon } from '../entities/ouverture-compte-tampon.entity';
import { PreouvertureClientTampon } from '../entities/preouverture-client-tampon.entity';
import { Setting } from '../entities/setting.entity';
import { ListeOperator } from '../entities/liste-operator.entity';
import { Transaction } from '../entities/transaction.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { MavianceClient } from '../maviance/maviance.client';
import { MavianceErrorMapper } from '../maviance/maviance-error.mapper';
import { PaynoteService } from '../paynote/paynote.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DepositDto } from './dto/deposit.dto';
import { OuvertureCompteDto } from './dto/ouverture-compte.dto';
import { PreouvertureDto } from './dto/preouverture.dto';
import { CollecteSyncNotificationDto } from './dto/collecte-sync-notification.dto';
import { randomBytes } from 'crypto';

type PaymentDecision = 'success' | 'pending' | 'failed' | 'unknown';
type UploadedPreouvertureFiles = Record<
  string,
  Array<{ filename: string; path: string }>
>;
type PaynotePendingOpening = {
  references: string;
  provider_message_id?: string;
  operateur: string;
  montant_initial: string;
  payment_json?: string;
  statut_validation: string;
  message_validation?: string;
  updated_at: Date;
};

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly repository: Repository<Transaction>,
    @InjectRepository(Compte)
    private readonly compteRepository: Repository<Compte>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
    @InjectRepository(OuvertureCompteTampon)
    private readonly ouvertureTamponRepository: Repository<OuvertureCompteTampon>,
    @InjectRepository(PreouvertureClientTampon)
    private readonly preouvertureTamponRepository: Repository<PreouvertureClientTampon>,
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    @InjectRepository(ListeOperator)
    private readonly listeOperatorRepository: Repository<ListeOperator>,
    @InjectRepository(Typecompte)
    private readonly typeCompteRepository: Repository<Typecompte>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly dataSource: DataSource,
    private readonly paynoteService: PaynoteService,
    private readonly mavianceClient: MavianceClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  create(payload: Partial<Transaction>) {
    return this.repository.save(payload);
  }

  findAll(page?: number, limit?: number) {
    const options: any = {
      order: { idtransaction: 'DESC' },
    };
    if (page !== undefined && limit !== undefined) {
      options.skip = (page - 1) * limit;
      options.take = limit;
    }
    return this.repository.find(options);
  }

  findOne(id: number) {
    return this.repository.findOneBy({ idtransaction: id });
  }

  async activeOperators() {
    const rows = await this.settingRepository.find({
      order: { idsetting: 'DESC' },
      take: 1,
    });
    const latest = rows[0];
    const activeRows = Array.isArray(latest?.operator_actif)
      ? latest.operator_actif
      : [];
    const activeCodes = new Set(
      activeRows
        .map((item) =>
          this.normalizeOperatorCode(String(item?.operateur || '')),
        )
        .filter(Boolean),
    );

    if (activeCodes.size === 0) {
      return [];
    }

    const catalogueRows = await this.listeOperatorRepository.find({
      order: { idliste_operator: 'DESC' },
      take: 1,
    });
    const catalogue = Array.isArray(catalogueRows[0]?.liste_operator)
      ? catalogueRows[0].liste_operator
      : [];
    const labelEntries: Array<[string, string]> = catalogue
      .map((item) => [
        this.normalizeOperatorCode(String(item?.code || '')),
        String(item?.nom || '').trim(),
      ])
      .filter(([code, label]) => Boolean(code && label)) as Array<
      [string, string]
    >;
    const labelByCode = new Map<string, string>(labelEntries);

    const forcedGateway = this.getConfiguredPaymentGateway();

    return [...activeCodes].map((code) => {
      const config = activeRows.find(
        (item) =>
          this.normalizeOperatorCode(String(item?.operateur || '')) === code,
      );
      const storedGateway =
        config && config['gateway']
          ? String(config['gateway']).trim().toLowerCase()
          : 'paynote';
      const gateway = forcedGateway || storedGateway;
      const payItemId = this.resolveMaviancePayItemId(code, config);
      return {
        code,
        nom: labelByCode.get(code) ?? this.operatorFallbackLabel(code),
        gateway,
        payItemId,
      };
    });
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
    const normalizedOperator = await this.normalizeOperator(dto.operateur);
    const operatorLedger =
      await this.findActiveOperatorLedger(normalizedOperator);
    const compte = await this.compteRepository.findOne({
      where: { idcompte: dto.idcompte },
    });

    if (!compte || compte.idclient !== effectiveClientId) {
      throw new NotFoundException('Compte introuvable');
    }
    await this.assertMobileDepositAllowed(compte.idtype);

    const references = dto.references?.trim() || this.buildOrderId('COLL');
    const description =
      dto.description?.trim() ||
      `Collecte mobile ${normalizedOperator.toUpperCase()} sur ${dto.numero_telephone}`;

    // 1. Pré-enregistrement en base en statut 'en_attente' avant l'appel externe
    let pendingTx = await this.repository.findOne({ where: { references } });
    if (pendingTx) {
      const sameRequest =
        pendingTx.idcompte === compte.idcompte &&
        Number(pendingTx.montant_transaction) === dto.montant_transaction &&
        pendingTx.operateur === normalizedOperator;
      if (!sameRequest) {
        throw new BadRequestException(
          'Cette reference de paiement est deja utilisee pour une autre operation.',
        );
      }
      if (pendingTx.statut === 'complete') {
        return {
          message: 'Ce versement a deja ete valide.',
          transaction: pendingTx,
          status: 'complete',
        };
      }
      if (pendingTx.statut === 'annulee') {
        throw new BadRequestException(
          'Cette reference correspond a un versement annule.',
        );
      }
      return this.recheckTransactionStatus(references, effectiveClientId);
    } else {
      pendingTx = await this.repository.save(
        this.repository.create({
          iduser: dto.iduser,
          idcompte: compte.idcompte,
          montant_transaction: dto.montant_transaction.toFixed(2),
          type_transaction: 'versement',
          operateur: normalizedOperator,
          idcompteimpact: operatorLedger?.idcompte_debit,
          statut: 'en_attente',
          references,
          description,
        }),
      );
    }

    // 2. Déclenchement du paiement vers la passerelle (Paynote ou Maviance)
    let paymentResult: unknown;
    try {
      paymentResult = await this.collectWithConfiguredGateway({
        operateur: normalizedOperator,
        numeroTelephone: dto.numero_telephone,
        montant: dto.montant_transaction,
        references,
        description,
        idcompte: dto.idcompte,
        idclient: effectiveClientId,
        onProviderReference: async (messageId) => {
          pendingTx.provider_message_id = messageId;
          await this.repository.update(pendingTx.idtransaction, {
            provider_message_id: messageId,
          });
        },
      });
    } catch (error) {
      // Si la session synchrone a expiré mais que la demande est partie chez l'opérateur
      const isPendingTimeout =
        error instanceof BadGatewayException &&
        (error.message.includes('en attente') ||
          error.message.includes('non confirme') ||
          error.message.includes('accepted_pending'));
      const providerRequestWasCreated = Boolean(pendingTx.provider_message_id);

      if (isPendingTimeout || providerRequestWasCreated) {
        this.logger.warn(
          `Depot ${references}: attente synchrone expiree. Transaction conservee en 'en_attente'.`,
        );
        return {
          message:
            'Demande de paiement transmise. Votre compte sera credite automatiquement des confirmation par l operateur.',
          status: 'pending',
          transaction: pendingTx,
          references,
        };
      }

      // En cas de rejet définitif immédiat par l'opérateur
      await this.failPendingDeposit(references, {
        error: (error as Error)?.message,
      });
      throw error;
    }

    // 3. Si le paiement est validé avec succès
    if (
      paymentResult &&
      typeof paymentResult === 'object' &&
      'provider_state' in paymentResult &&
      paymentResult.provider_state === 'accepted_pending'
    ) {
      return {
        message:
          'Demande de paiement transmise. Le compte sera credite uniquement apres confirmation de l operateur.',
        status: 'pending',
        transaction: pendingTx,
        references,
      };
    }

    const finalized = await this.finalizePendingDeposit(
      references,
      paymentResult,
    );

    return {
      message: 'Paiement valide. Votre versement a ete enregistre.',
      transaction: finalized.transaction || pendingTx,
      payment: paymentResult,
      status: 'complete',
    };
  }

  async syncCollecteNotification(dto: CollecteSyncNotificationDto) {
    const reference = dto.references?.trim();
    return this.dataSource.transaction(async (manager) => {
      const compte = await manager.findOne(Compte, {
        where: { idcompte: dto.idcompte },
        lock: { mode: 'pessimistic_write' },
      });

      if (!compte) {
        throw new NotFoundException('Compte core introuvable');
      }

      const idclient = Number(compte.idclient || 0);
      if (idclient <= 0) {
        throw new BadRequestException('Compte sans client rattache');
      }

      if (reference) {
        const existingTransaction = await manager.findOne(Transaction, {
          where: { references: reference },
        });
        if (existingTransaction) {
          return {
            success: true,
            transaction: existingTransaction,
            notification: null,
            duplicate: true,
          };
        }
      }

      const amount = Number(dto.montant_transaction);
      const transaction = manager.create(Transaction, {
        iduser: dto.iduser,
        idcompte: compte.idcompte,
        montant_transaction: amount.toFixed(2),
        type_transaction: 'versement',
        operateur: 'sbscollecte',
        statut: 'complete',
        references: reference || `SBSCOL-${Date.now()}`,
        description: dto.description?.trim() || 'Collecte mobile SBS Collecte',
        date_transaction: dto.date_transaction
          ? new Date(dto.date_transaction)
          : new Date(),
      });
      const savedTransaction = await manager.save(transaction);

      compte.solde = (Number(compte.solde || 0) + amount).toFixed(2);
      await manager.save(compte);

      const notification = manager.create(Notification, {
        idclient,
        titre: 'Versement recu',
        message: this.buildDepositNotificationMessage({
          amount,
          numeroCompte: compte.numero_compte,
        }),
        type: 'versement',
        lu: 0,
      });
      const savedNotification = await manager.save(notification);
      this.notificationsService.emitCreated(savedNotification);

      return {
        success: true,
        transaction: savedTransaction,
        notification: savedNotification,
        duplicate: false,
      };
    });
  }

  async openableTypecomptes(authenticatedClientId: number) {
    if (!authenticatedClientId) {
      throw new UnauthorizedException('Utilisateur non authentifie');
    }

    const existingComptes = await this.compteRepository.find({
      where: { idclient: authenticatedClientId },
      select: ['idtype'],
    });
    const existingTypeIds = existingComptes.map((compte) => compte.idtype);

    const pendingDemandes = await this.ouvertureTamponRepository.find({
      where: {
        idclient: authenticatedClientId,
        statut_validation: 'pending_validation',
      },
      select: ['idtype'],
    });
    for (const demande of pendingDemandes) {
      if (!existingTypeIds.includes(demande.idtype)) {
        existingTypeIds.push(demande.idtype);
      }
    }

    const query = this.typeCompteRepository
      .createQueryBuilder('typecompte')
      .where('typecompte.mobile_sync_enabled = 1')
      .andWhere('typecompte.mobile_can_open = 1');

    if (existingTypeIds.length > 0) {
      query.andWhere('typecompte.idtype NOT IN (:...existingTypeIds)', {
        existingTypeIds,
      });
    }

    const types = await query.orderBy('typecompte.idtype', 'ASC').getMany();

    return types.map((typeCompte) => this.openableTypeResponse(typeCompte));
  }

  async requestCompteOpening(
    dto: OuvertureCompteDto,
    authenticatedClientId: number,
  ) {
    if (!authenticatedClientId) {
      throw new UnauthorizedException('Utilisateur non authentifie');
    }

    const client = await this.clientRepository.findOneBy({
      idclient: authenticatedClientId,
    });
    if (!client) {
      throw new NotFoundException('Client introuvable');
    }

    const typeCompte = await this.assertMobileOpeningAllowed(dto.idtype);

    const minimum = this.openingMinimum(typeCompte);
    if (dto.montant_initial < minimum) {
      throw new BadRequestException(
        `Montant initial insuffisant. Le minimum est ${minimum} XAF.`,
      );
    }

    const normalizedOperator = await this.normalizeOperator(dto.operateur);
    const references = dto.references?.trim() || this.buildOrderId('OUV');
    const description =
      dto.description?.trim() ||
      `Ouverture compte ${typeCompte.libelle} ${normalizedOperator.toUpperCase()} - ${dto.numero_telephone}`;

    const existing = await this.ouvertureTamponRepository.findOne({
      where: { references },
    });
    if (existing) {
      if (
        existing.idclient !== authenticatedClientId ||
        existing.idtype !== typeCompte.idtype ||
        Number(existing.montant_initial) !== dto.montant_initial ||
        existing.operateur !== normalizedOperator
      ) {
        throw new BadRequestException(
          'Cette reference est deja utilisee pour une autre ouverture.',
        );
      }
      return {
        message: 'Cette demande d ouverture existe deja.',
        demande: existing,
        payment: this.parseStoredPayment(existing.payment_json),
        status: existing.statut_validation,
      };
    }
    await this.assertTypeNotOwned(authenticatedClientId, dto.idtype);

    const demande = await this.ouvertureTamponRepository.save(
      this.ouvertureTamponRepository.create({
        idclient: authenticatedClientId,
        idtype: typeCompte.idtype,
        idag: client.idag,
        montant_initial: dto.montant_initial.toFixed(2),
        frais_ouverture: Number(typeCompte.frais_ouverture || 0),
        montant_minimum: minimum.toFixed(2),
        operateur: normalizedOperator,
        numero_telephone: dto.numero_telephone.trim(),
        references,
        description,
        statut_validation: 'payment_pending',
        updated_at: new Date(),
      }),
    );

    let payment: unknown;
    try {
      payment = await this.collectWithConfiguredGateway({
        operateur: normalizedOperator,
        numeroTelephone: dto.numero_telephone,
        montant: dto.montant_initial,
        references,
        description,
        onProviderReference: async (messageId) => {
          demande.provider_message_id = messageId;
          await this.ouvertureTamponRepository.update(demande.id, {
            provider_message_id: messageId,
          });
        },
      });
    } catch (error) {
      if (demande.provider_message_id) {
        demande.message_validation =
          'Paiement initie, confirmation operateur en attente.';
        await this.ouvertureTamponRepository.save(demande);
        return {
          message: demande.message_validation,
          demande,
          status: 'payment_pending',
        };
      }
      demande.statut_validation = 'payment_failed';
      demande.message_validation =
        error instanceof Error ? error.message : 'Paiement indisponible';
      await this.ouvertureTamponRepository.save(demande);
      throw error;
    }

    demande.payment_json = JSON.stringify(payment);
    demande.statut_validation = this.isAcceptedPendingResult(payment)
      ? 'payment_pending'
      : 'pending_validation';
    demande.updated_at = new Date();
    await this.ouvertureTamponRepository.save(demande);

    return {
      message:
        demande.statut_validation === 'payment_pending'
          ? 'Paiement initie, confirmation operateur en attente.'
          : 'Demande d ouverture envoyee, en attente de validation',
      demande,
      payment,
      status: demande.statut_validation,
    };
  }

  async findByClient(idclient: number, dateDebut?: string, dateFin?: string) {
    try {
      const query = this.repository
        .createQueryBuilder('transaction')
        .innerJoin(Compte, 'compte', 'compte.idcompte = transaction.idcompte')
        .innerJoin(
          Typecompte,
          'typecompte',
          'typecompte.idtype = compte.idtype',
        )
        .where('compte.idclient = :idclient', { idclient })
        .andWhere('typecompte.mobile_sync_enabled = 1')
        .andWhere('typecompte.mobile_can_view = 1');

      if (dateDebut) {
        query.andWhere('DATE(transaction.date_transaction) >= :dateDebut', {
          dateDebut,
        });
      }
      if (dateFin) {
        query.andWhere('DATE(transaction.date_transaction) <= :dateFin', {
          dateFin,
        });
      }

      return await query
        .orderBy('transaction.date_transaction', 'DESC')
        .getMany();
    } catch (error) {
      if (!this.isMissingOperateurColumnError(error)) {
        throw error;
      }

      // Backward compatibility when migration for transaction.operateur is not applied.
      const filters: string[] = [];
      const params: Array<number | string> = [idclient];
      if (dateDebut) {
        filters.push('AND DATE(t.date_transaction) >= ?');
        params.push(dateDebut);
      }
      if (dateFin) {
        filters.push('AND DATE(t.date_transaction) <= ?');
        params.push(dateFin);
      }

      const rows = await this.dataSource.query(
        `
        SELECT
          t.idtransaction,
          t.iduser,
          t.idcompte,
          t.idcompteimpact,
          t.type_transaction,
          t.montant_transaction,
          t.statut,
          t.references,
          t.description,
          t.date_transaction
        FROM transaction t
        INNER JOIN compte c ON c.idcompte = t.idcompte
        INNER JOIN typecompte tc ON tc.idtype = c.idtype
        WHERE c.idclient = ?
          AND tc.mobile_sync_enabled = 1
          AND tc.mobile_can_view = 1
          ${filters.join('\n          ')}
        ORDER BY t.date_transaction DESC
        `,
        params,
      );

      return Array.isArray(rows)
        ? rows.map((row) => ({ ...row, operateur: null }))
        : [];
    }
  }

  async preouvertureWithDeposit(
    dto: PreouvertureDto,
    files: UploadedPreouvertureFiles = {},
  ) {
    const photoProfil = this.uploadedFileUrl(files, 'photo_profil');
    const signature = this.uploadedFileUrl(files, 'signature');
    const legacyPhotoCni = this.uploadedFileUrl(files, 'photo_cni');
    const photoPieceRecto =
      this.uploadedFileUrl(files, 'photo_piece_recto') ?? legacyPhotoCni;
    const photoPieceVerso = this.uploadedFileUrl(files, 'photo_piece_verso');

    if (!photoProfil || !signature) {
      this.logger.warn(
        `Pre-ouverture sans images requises: profil=${Boolean(
          photoProfil,
        )}, signature=${Boolean(signature)}`,
      );
      throw new BadRequestException(
        'La photo de profil et la signature sont obligatoires.',
      );
    }

    if (dto.type_piece && (!photoPieceRecto || !photoPieceVerso)) {
      this.logger.warn('Pre-ouverture avec piece sans recto/verso');
      throw new BadRequestException(
        'Les images CNI/Passport recto et verso sont obligatoires.',
      );
    }

    const normalizedOperator = await this.normalizeOperator(dto.operateur);
    const idtype = dto.idtype ?? this.resolveTypeCompte(dto.type_compte);
    const typeCompte = await this.assertMobileOpeningAllowed(idtype);
    const minimum = this.openingMinimum(typeCompte);
    if (dto.montant_initial < minimum) {
      throw new BadRequestException(
        `Montant initial insuffisant. Le minimum est ${minimum} XAF.`,
      );
    }

    const numeroOperation =
      dto.numero_telephone?.trim() || dto.telephone_principal.trim();
    const references = dto.references?.trim() || this.buildOrderId('PRE');
    const description =
      dto.description?.trim() ||
      `Depot initial ${normalizedOperator.toUpperCase()} - ${numeroOperation}`;
    const normalizedEmail = dto.email?.trim().toLowerCase() || undefined;

    const existing = await this.preouvertureTamponRepository.findOne({
      where: { references },
    });
    if (existing) {
      if (
        (existing.email?.trim().toLowerCase() || undefined) !==
          normalizedEmail ||
        Number(existing.montant_initial) !== dto.montant_initial ||
        existing.operateur !== normalizedOperator
      ) {
        throw new BadRequestException(
          'Cette reference est deja utilisee pour une autre pre-ouverture.',
        );
      }
      return {
        message: 'Cette demande de pre-ouverture existe deja.',
        demande: existing,
        payment: this.parseStoredPayment(existing.payment_json),
        status: existing.statut_validation,
      };
    }

    const demande = await this.preouvertureTamponRepository.save(
      this.preouvertureTamponRepository.create({
        nom: dto.nom.trim().toUpperCase(),
        prenom: dto.prenom?.trim(),
        // Keep compatibility with databases where the nullable-field
        // migration has not been deployed yet.
        email: normalizedEmail ?? '',
        telephone_principal: dto.telephone_principal.trim(),
        numero_telephone: numeroOperation,
        mot_de_passe: dto.mot_de_passe?.trim() || '',
        type_piece: this.normalizePieceIdentite(dto.type_piece),
        num_piece_identite:
          dto.num_piece_identite?.trim() || `TMP-${Date.now()}`,
        adresse: dto.adresse?.trim() || 'Non renseignee',
        code_postal: dto.code_postal?.trim() || '0000',
        ville: dto.ville?.trim() || 'Non renseignee',
        idag: dto.idag,
        idtype,
        montant_initial: dto.montant_initial.toFixed(2),
        frais_ouverture: Number(typeCompte.frais_ouverture || 0),
        montant_minimum: minimum.toFixed(2),
        operateur: normalizedOperator,
        references,
        description,
        photo_profil: photoProfil,
        signature,
        photo_cni: legacyPhotoCni,
        photo_piece_recto: photoPieceRecto,
        photo_piece_verso: photoPieceVerso,
        statut_validation: 'payment_pending',
        updated_at: new Date(),
      }),
    );

    let paymentResult: unknown;
    try {
      paymentResult = await this.collectWithConfiguredGateway({
        operateur: normalizedOperator,
        numeroTelephone: numeroOperation,
        montant: dto.montant_initial,
        references,
        description,
        customerEmail: normalizedEmail,
        customerName: [dto.prenom, dto.nom].filter(Boolean).join(' '),
        customerAddress: dto.adresse,
        onProviderReference: async (messageId) => {
          demande.provider_message_id = messageId;
          await this.preouvertureTamponRepository.update(demande.id, {
            provider_message_id: messageId,
          });
        },
      });
    } catch (error) {
      if (demande.provider_message_id) {
        demande.message_validation =
          'Paiement initie, confirmation operateur en attente.';
        await this.preouvertureTamponRepository.save(demande);
        return {
          message: demande.message_validation,
          demande,
          status: 'payment_pending',
        };
      }
      demande.statut_validation = 'payment_failed';
      demande.message_validation =
        error instanceof Error ? error.message : 'Paiement indisponible';
      await this.preouvertureTamponRepository.save(demande);
      throw error;
    }

    demande.payment_json = JSON.stringify(paymentResult);
    demande.statut_validation = this.isAcceptedPendingResult(paymentResult)
      ? 'payment_pending'
      : 'pending_validation';
    demande.updated_at = new Date();
    await this.preouvertureTamponRepository.save(demande);

    return {
      message:
        demande.statut_validation === 'payment_pending'
          ? 'Paiement initie, confirmation operateur en attente.'
          : 'Pre-ouverture envoyee, en attente de validation',
      demande,
      payment: paymentResult,
      status: demande.statut_validation,
    };
  }

  private uploadedFileUrl(
    files: UploadedPreouvertureFiles,
    fieldName: string,
  ): string | undefined {
    const file = files[fieldName]?.[0];
    if (!file?.filename) {
      return undefined;
    }
    return `/uploads/preouverture/${file.filename}`;
  }

  private async collectWithConfiguredGateway(payload: {
    operateur: 'om' | 'momo';
    numeroTelephone: string;
    montant: number;
    references: string;
    description: string;
    idcompte?: number;
    idclient?: number;
    customerEmail?: string;
    customerName?: string;
    customerAddress?: string;
    onProviderReference?: (messageId: string) => Promise<void>;
  }) {
    if (this.getConfiguredPaymentGateway() === 'maviance') {
      return this.collectWithMaviance(payload);
    }

    return this.collectWithPaynote(payload);
  }

  private async collectWithPaynote(payload: {
    operateur: 'om' | 'momo';
    numeroTelephone: string;
    montant: number;
    references: string;
    description: string;
    onProviderReference?: (messageId: string) => Promise<void>;
  }) {
    if (this.getConfiguredPaymentGateway() === 'maviance') {
      throw new BadRequestException(
        'Paynote est desactive par MYAPIOPERATOR=maviance.',
      );
    }

    try {
      if (payload.operateur === 'om') {
        const payment = await this.paynoteService.orangePay({
          amount: payload.montant,
          subscriberMsisdn: payload.numeroTelephone,
          orderId: payload.references,
          description: payload.description,
        });

        const immediateDecision = this.getPaymentDecision(payment);
        if (immediateDecision === 'failed') {
          throw new BadGatewayException(
            `Paiement Orange rejete: ${this.summarizePaymentState(payment)}`,
          );
        }

        const messageId = this.extractStringField(payment, [
          'MessageId',
          'message_id',
          'messageId',
          'paytoken',
          'payToken',
        ]);
        if (!messageId) {
          if (immediateDecision === 'success') return { payment };
          throw new BadGatewayException(
            'Paiement Orange initie mais aucun message_id retourne pour verifier le statut',
          );
        }
        await payload.onProviderReference?.(messageId);

        const confirmed = await this.pollPaymentStatus(async () =>
          this.paynoteService.orangePaymentStatus({ messageId }),
        );
        if (confirmed.decision === 'success') {
          return {
            payment,
            status: confirmed.payload,
            provider_message_id: messageId,
          };
        }

        if (
          confirmed.decision === 'pending' &&
          this.isProviderAccepted(confirmed.payload)
        ) {
          return {
            payment,
            status: confirmed.payload,
            provider_state: 'accepted_pending',
            provider_message_id: messageId,
          };
        }

        throw new BadGatewayException(
          `Paiement Orange en attente/non confirme: ${this.summarizePaymentState(
            confirmed.payload,
          )}`,
        );
      }

      const payment = await this.paynoteService.mtnPay({
        amount: payload.montant,
        subscriberMsisdn: payload.numeroTelephone,
        orderId: payload.references,
        description: payload.description,
        paymentMethod: 'MTN_CMR',
      });

      const immediateDecision = this.getPaymentDecision(payment);
      if (immediateDecision === 'failed') {
        throw new BadGatewayException(
          `Paiement MTN rejete: ${this.summarizePaymentState(payment)}`,
        );
      }

      const messageId = this.extractStringField(payment, [
        'MessageId',
        'message_id',
        'messageId',
      ]);
      if (!messageId) {
        if (immediateDecision === 'success') return { payment };
        throw new BadGatewayException(
          'Paiement MTN initie mais aucun message_id retourne pour verifier le statut',
        );
      }
      await payload.onProviderReference?.(messageId);

      const confirmed = await this.pollPaymentStatus(async () =>
        this.paynoteService.mtnPaymentStatus({ messageId }),
      );
      if (confirmed.decision === 'success') {
        return {
          payment,
          status: confirmed.payload,
          provider_message_id: messageId,
        };
      }

      // Un accusé "Pay Request Accepted" confirme seulement la prise en charge.
      // Le crédit reste en attente jusqu'au statut final de l'opérateur.
      if (
        confirmed.decision === 'pending' &&
        this.isProviderAccepted(confirmed.payload)
      ) {
        return {
          payment,
          status: confirmed.payload,
          provider_state: 'accepted_pending',
          provider_message_id: messageId,
        };
      }

      throw new BadGatewayException(
        `Paiement MTN en attente/non confirme: ${this.summarizePaymentState(
          confirmed.payload,
        )}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Paiement mobile indisponible';
      throw new BadGatewayException(message);
    }
  }

  private async collectWithMaviance(payload: {
    operateur: 'om' | 'momo';
    numeroTelephone: string;
    montant: number;
    references: string;
    description: string;
    idcompte?: number;
    idclient?: number;
    customerEmail?: string;
    customerName?: string;
    customerAddress?: string;
  }) {
    const config = await this.findActiveOperatorConfig(payload.operateur);
    const payItemId = this.resolveMaviancePayItemId(payload.operateur, config);

    if (!payItemId) {
      throw new BadRequestException(
        `Configuration Maviance incomplete pour ${payload.operateur.toUpperCase()}: payItemId manquant.`,
      );
    }

    const client = payload.idclient
      ? await this.clientRepository.findOneBy({ idclient: payload.idclient })
      : null;
    const customerName =
      payload.customerName?.trim() ||
      [client?.prenom, client?.nom].filter(Boolean).join(' ').trim();

    const sandboxTestNumbers =
      String(process.env.MAVIANCE_SANDBOX_USE_TEST_NUMBERS || '')
        .trim()
        .toLowerCase() === 'true';
    const operatorKey = payload.operateur.toUpperCase();
    const configuredCustomerPhone = sandboxTestNumbers
      ? process.env[`MAVIANCE_SANDBOX_${operatorKey}_CUSTOMER_PHONE`]
      : undefined;
    const configuredServiceNumber = sandboxTestNumbers
      ? process.env[`MAVIANCE_SANDBOX_${operatorKey}_SERVICE_NUMBER`]
      : undefined;
    const customerPhone = this.normalizeCameroonPhone(
      configuredCustomerPhone || payload.numeroTelephone,
    );
    const serviceNumber = this.normalizeCameroonPhone(
      configuredServiceNumber || payload.numeroTelephone,
    );

    try {
      const quote = await this.mavianceClient.request<any>(
        'POST',
        '/quotestd',
        {
          payItemId,
          amount: payload.montant,
        },
      );
      const quoteId = this.extractStringField(quote, ['quoteId', 'quoteid']);

      if (!quoteId) {
        throw new BadGatewayException('Maviance n a pas retourne de quoteId.');
      }

      const collectPayload: Record<string, any> = {
        quoteId,
        customerPhonenumber: customerPhone,
        customerEmailaddress:
          payload.customerEmail?.trim() ||
          client?.email?.trim() ||
          'client@sbs.local',
        customerName: customerName || 'Client SBS',
        customerAddress:
          payload.customerAddress?.trim() ||
          client?.adresse?.trim() ||
          'Non renseignee',
        serviceNumber,
        trid: payload.references,
      };

      const collect = await this.mavianceClient.request<any>(
        'POST',
        '/collectstd',
        collectPayload,
      );
      const immediateDecision = this.getMaviancePaymentDecision(collect);

      if (immediateDecision.decision === 'success') {
        return { gateway: 'maviance', quote, collect };
      }
      if (immediateDecision.decision === 'failed') {
        throw new BadGatewayException(immediateDecision.message);
      }

      const confirmed = await this.pollMaviancePaymentStatus(async () =>
        this.mavianceClient.request<any>('GET', '/verifytx', {
          trid: payload.references,
        }),
      );
      const finalDecision = this.getMaviancePaymentDecision(confirmed.payload);

      if (finalDecision.decision === 'success') {
        return {
          gateway: 'maviance',
          quote,
          collect,
          status: confirmed.payload,
        };
      }

      throw new BadGatewayException(finalDecision.message);
    } catch (error) {
      const message = this.toReadableMavianceError(error);
      throw new BadGatewayException(message);
    }
  }

  private async normalizeOperator(value: string): Promise<'om' | 'momo'> {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    let resolved: 'om' | 'momo';

    if (['om', 'orange', 'orange money'].includes(normalized)) {
      resolved = 'om';
    } else if (
      [
        'momo',
        'mtn',
        'mtn momo',
        'mtn mobile money',
        'mobile money',
        'mobilemoney',
      ].includes(normalized)
    ) {
      resolved = 'momo';
    } else {
      throw new BadRequestException('Operateur invalide. Utilisez om ou momo');
    }

    const activeOperators = await this.readActiveOperatorCodes();
    if (activeOperators.size > 0 && !activeOperators.has(resolved)) {
      throw new BadRequestException(
        `Operateur ${resolved} desactive. Activez-le dans les parametres.`,
      );
    }

    return resolved;
  }

  private normalizeOperatorCode(value: string) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '');
  }

  private getConfiguredPaymentGateway(): 'paynote' | 'maviance' {
    const value = String(process.env.MYAPIOPERATOR || '')
      .trim()
      .toLowerCase();

    if (!value) return 'maviance';
    if (value === 'paynote' || value === 'maviance') return value;

    this.logger.warn(
      `MYAPIOPERATOR invalide (${value}). Valeurs acceptees: paynote, maviance. Fallback: maviance.`,
    );
    return 'maviance';
  }

  private resolveMaviancePayItemId(code: string, config?: any): string | null {
    const storedPayItemId =
      config &&
      config['payItemId'] !== undefined &&
      config['payItemId'] !== null
        ? String(config['payItemId']).trim()
        : null;

    if (storedPayItemId) {
      return storedPayItemId;
    }

    const normalizedCode = this.normalizeOperatorCode(code).toUpperCase();
    const envByOperator = process.env[`MAVIANCE_PAYITEM_${normalizedCode}`];
    const envFallback = process.env.MAVIANCE_DEFAULT_PAY_ITEM_ID;
    const payItemId = String(envByOperator || envFallback || '').trim();

    return payItemId || null;
  }

  private operatorFallbackLabel(code: string) {
    if (code === 'om') return 'Orange Money';
    if (code === 'momo') return 'MTN MoMo';
    return code.toUpperCase();
  }

  private async readActiveOperatorCodes() {
    const rows = await this.settingRepository.find({
      order: { idsetting: 'DESC' },
      take: 1,
    });

    const latest = rows[0];
    if (!latest || !Array.isArray(latest.operator_actif)) {
      return new Set<string>();
    }

    return new Set(
      latest.operator_actif
        .map((item) =>
          String(item?.operateur || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
  }

  private async findActiveOperatorLedger(code: string) {
    const row = await this.findActiveOperatorConfig(code);
    if (!row) return null;

    const idcompte = row.idcompte ? Number(row.idcompte) : undefined;
    return {
      idtype_credit:
        Number(row.idtype_credit ?? row.idtypecompte ?? 0) || undefined,
      idtype_debit:
        Number(row.idtype_debit ?? row.idtypecompte ?? 0) || undefined,
      idcompte_credit:
        row.idcompte_credit !== undefined && row.idcompte_credit !== null
          ? Number(row.idcompte_credit)
          : idcompte,
      idcompte_debit:
        row.idcompte_debit !== undefined && row.idcompte_debit !== null
          ? Number(row.idcompte_debit)
          : idcompte,
    };
  }

  private async findActiveOperatorConfig(code: string): Promise<any | null> {
    const rows = await this.settingRepository.find({
      order: { idsetting: 'DESC' },
      take: 1,
    });
    const latest = rows[0];
    const rawList = Array.isArray(latest?.operator_actif)
      ? latest.operator_actif
      : [];
    const normalizedCode = this.normalizeOperatorCode(code);
    const row = rawList.find(
      (item) =>
        this.normalizeOperatorCode(String(item?.operateur || '')) ===
        normalizedCode,
    );
    return row || null;
  }

  private getPaymentDecision(payment: unknown): PaymentDecision {
    const keyValues = this.extractStatusKeyValues(payment);
    if (keyValues.length === 0) return 'unknown';

    const values = keyValues.map((item) => item.value);
    const statusValue =
      keyValues.find((item) => item.key === 'status')?.value || '';
    const bodyValue =
      keyValues.find((item) => item.key === 'body')?.value || '';
    const confirmTxnStatus =
      keyValues.find((item) => item.key === 'confirmtxnstatus')?.value || '';
    const errorCode =
      keyValues.find((item) => item.key === 'errorcode')?.value ||
      keyValues.find((item) => item.key === 'statuscode')?.value ||
      '';

    const successWords = [
      'successful',
      'successfull',
      'success',
      'succeeded',
      'complete',
      'completed',
      'approved',
      'paid',
    ];
    const failedWords = [
      'fail',
      'failed',
      'cancel',
      'annule',
      'reject',
      'declined',
      'timeout',
      'denied',
      'insufficient',
      'forbidden',
    ];
    const pendingWords = [
      'pending',
      'initiated',
      'accepted',
      'processing',
      'in progress',
      'waiting',
    ];

    if (
      failedWords.some((word) => values.some((value) => value.includes(word)))
    ) {
      return 'failed';
    }

    if (confirmTxnStatus === '200') return 'success';

    if (successWords.some((word) => statusValue.includes(word))) {
      return 'success';
    }

    if (pendingWords.some((word) => statusValue.includes(word))) {
      return 'pending';
    }

    if (bodyValue.includes('pay request accepted')) {
      return 'pending';
    }

    if (errorCode && !['200', '201'].includes(errorCode)) {
      return 'failed';
    }
    if (errorCode && ['200', '201'].includes(errorCode)) {
      return 'pending';
    }

    if (
      successWords.some((word) => values.some((value) => value.includes(word)))
    ) {
      return 'success';
    }
    if (
      pendingWords.some((word) => values.some((value) => value.includes(word)))
    ) {
      return 'pending';
    }

    return 'unknown';
  }

  private extractStatusKeyValues(
    payload: unknown,
  ): Array<{ key: string; value: string }> {
    const values: Array<{ key: string; value: string }> = [];
    const walk = (node: unknown) => {
      if (!node) return;
      if (typeof node !== 'object') return;

      const record = node as Record<string, unknown>;
      for (const [rawKey, rawValue] of Object.entries(record)) {
        const key = rawKey.toLowerCase();
        if (typeof rawValue === 'string' || typeof rawValue === 'number') {
          const value = String(rawValue).trim();
          values.push({ key, value: value.toLowerCase() });

          // Paynote may return JSON encoded as a string in `message`.
          // Decode and inspect it to detect real status/error fields.
          if (typeof rawValue === 'string') {
            const firstChar = value[0];
            if (firstChar === '{' || firstChar === '[') {
              try {
                const parsed = JSON.parse(value);
                if (parsed && typeof parsed === 'object') {
                  walk(parsed);
                }
              } catch {
                // Ignore invalid JSON-like strings
              }
            }
          }
        }
        if (rawValue && typeof rawValue === 'object') {
          walk(rawValue);
        }
      }
    };

    walk(payload);
    return values;
  }

  private extractStringField(payload: unknown, keys: string[]): string | null {
    const normalizedKeys = keys.map((key) => key.toLowerCase());
    let found: string | null = null;

    const walk = (node: unknown) => {
      if (!node || found) return;
      if (typeof node !== 'object') return;

      const record = node as Record<string, unknown>;
      for (const [rawKey, rawValue] of Object.entries(record)) {
        const key = rawKey.toLowerCase();
        if (
          normalizedKeys.includes(key) &&
          (typeof rawValue === 'string' || typeof rawValue === 'number')
        ) {
          const value = String(rawValue).trim();
          if (value) {
            found = value;
            return;
          }
        }

        if (rawValue && typeof rawValue === 'object') {
          walk(rawValue);
        }
      }
    };

    walk(payload);
    return found;
  }

  private summarizePaymentState(payload: unknown): string {
    const items = this.extractStatusKeyValues(payload);
    if (!items.length) return 'reponse vide';

    const interesting = new Set([
      'status',
      'body',
      'message',
      'errorcode',
      'statuscode',
      'confirmtxnstatus',
      'txnstatus',
      'inittxnstatus',
    ]);
    const compact = items
      .filter((item) => interesting.has(item.key))
      .slice(0, 6)
      .map((item) => `${item.key}=${item.value}`);

    return compact.length ? compact.join(', ') : 'statut non interpretable';
  }

  private isProviderAccepted(payload: unknown): boolean {
    const items = this.extractStatusKeyValues(payload);
    if (!items.length) return false;

    const byKey = (key: string) =>
      items.find((item) => item.key === key)?.value || '';
    const errorCode = byKey('errorcode') || byKey('statuscode');
    const body = byKey('body');

    const codeAccepted = ['200', '201'].includes(errorCode);
    const bodyAccepted =
      body.includes('pay request accepted') || body.includes('accepted');

    return codeAccepted || bodyAccepted;
  }

  private getMaviancePaymentDecision(payload: unknown): {
    decision: PaymentDecision;
    message: string;
  } {
    const items = this.extractStatusKeyValues(payload);
    const valueByKey = (keys: string[]) => {
      for (const key of keys) {
        const found = items.find((item) => item.key === key)?.value;
        if (found) return found;
      }
      return '';
    };

    const status = valueByKey([
      'status',
      'txstatus',
      'transactionstatus',
      'state',
    ]);
    const code = valueByKey(['errorcode', 'code', 'statuscode']);
    const message = valueByKey(['errormessage', 'message', 'reason']);
    const combined = `${status} ${code} ${message}`.toLowerCase();

    if (
      combined.includes('success') ||
      combined.includes('successful') ||
      combined.includes('completed') ||
      combined.includes('paid')
    ) {
      return {
        decision: 'success',
        message: 'Paiement valide.',
      };
    }

    if (
      combined.includes('insufficient') ||
      combined.includes('insuffisant') ||
      code === '703108'
    ) {
      return {
        decision: 'failed',
        message: 'Solde payeur insuffisant pour effectuer le paiement.',
      };
    }

    if (
      combined.includes('cancel') ||
      combined.includes('annul') ||
      combined.includes('refus') ||
      combined.includes('declined') ||
      code === '703202'
    ) {
      return {
        decision: 'failed',
        message: 'Operation annulee ou refusee par le payeur.',
      };
    }

    if (
      combined.includes('timeout') ||
      combined.includes('expired') ||
      combined.includes('not confirm') ||
      code === '703201'
    ) {
      return {
        decision: 'failed',
        message: 'Le payeur n a pas confirme le paiement a temps.',
      };
    }

    if (
      combined.includes('fail') ||
      combined.includes('error') ||
      combined.includes('reject') ||
      (code && !['200', '201', '0'].includes(code))
    ) {
      return {
        decision: 'failed',
        message: MavianceErrorMapper.mapCode(
          code,
          message || 'Echec du paiement Maviance.',
        ),
      };
    }

    return {
      decision: 'pending',
      message:
        'Paiement non confirme. Verifiez la validation sur le telephone payeur.',
    };
  }

  private async pollMaviancePaymentStatus(
    fetchStatus: () => Promise<unknown>,
  ): Promise<{ decision: PaymentDecision; payload: unknown }> {
    const attempts = Math.max(
      1,
      Number(process.env.MAVIANCE_STATUS_POLL_ATTEMPTS ?? 20),
    );
    const delayMs = Math.max(
      250,
      Number(process.env.MAVIANCE_STATUS_POLL_DELAY_MS ?? 3000),
    );

    let lastPayload: unknown = null;
    let lastDecision: PaymentDecision = 'unknown';

    for (let i = 0; i < attempts; i++) {
      lastPayload = await fetchStatus();
      lastDecision = this.getMaviancePaymentDecision(lastPayload).decision;

      if (lastDecision === 'success' || lastDecision === 'failed') {
        return { decision: lastDecision, payload: lastPayload };
      }

      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { decision: lastDecision, payload: lastPayload };
  }

  private toReadableMavianceError(error: unknown): string {
    const response =
      error && typeof error === 'object' && 'getResponse' in error
        ? (error as { getResponse: () => unknown }).getResponse()
        : error;
    const items = this.extractStatusKeyValues(response);
    const code =
      items.find((item) => item.key === 'respcode')?.value ||
      items.find((item) => item.key === 'errorcode')?.value ||
      items.find((item) => item.key === 'statuscode')?.value ||
      items.find((item) => item.key === 'code')?.value ||
      '';
    const message =
      items.find((item) => item.key === 'usrmsg')?.value ||
      items.find((item) => item.key === 'devmsg')?.value ||
      items.find((item) => item.key === 'errormessage')?.value ||
      items.find((item) => item.key === 'reason')?.value ||
      items.find((item) => item.key === 'message')?.value ||
      '';
    const combined = `${code} ${message}`.toLowerCase();

    if (code === '4009' || combined.includes('access token invalid')) {
      return 'Identifiants Maviance invalides pour cet environnement. Verifiez le token, le secret et l URL S3P.';
    }
    if (
      code === '4006' ||
      combined.includes('signature does not pass server validation')
    ) {
      return 'Signature Maviance invalide. Verifiez le secret, les parametres signes et l horloge du serveur.';
    }

    if (combined.includes('insufficient') || code === '703108') {
      return 'Solde payeur insuffisant pour effectuer le paiement.';
    }
    if (
      combined.includes('cancel') ||
      combined.includes('annul') ||
      combined.includes('refus') ||
      combined.includes('declined') ||
      code === '703202'
    ) {
      return 'Operation annulee ou refusee par le payeur.';
    }
    if (
      combined.includes('timeout') ||
      combined.includes('expired') ||
      code === '703201'
    ) {
      return 'Le payeur n a pas confirme le paiement a temps.';
    }

    return MavianceErrorMapper.mapCode(
      code,
      message ||
        (error instanceof Error
          ? error.message
          : 'Paiement Maviance indisponible.'),
    );
  }

  private normalizeCameroonPhone(value: string) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('237')) return digits;
    return `237${digits}`;
  }

  private async pollPaymentStatus(
    fetchStatus: () => Promise<unknown>,
  ): Promise<{ decision: PaymentDecision; payload: unknown }> {
    const attempts = Math.max(
      1,
      Number(process.env.PAYNOTE_STATUS_POLL_ATTEMPTS ?? 60),
    );
    const delayMs = Math.max(
      250,
      Number(process.env.PAYNOTE_STATUS_POLL_DELAY_MS ?? 3000),
    );

    let lastPayload: unknown = null;
    let lastDecision: PaymentDecision = 'unknown';

    for (let i = 0; i < attempts; i++) {
      lastPayload = await fetchStatus();
      lastDecision = this.getPaymentDecision(lastPayload);

      if (lastDecision === 'success' || lastDecision === 'failed') {
        return { decision: lastDecision, payload: lastPayload };
      }

      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { decision: lastDecision, payload: lastPayload };
  }

  private resolveTypeCompte(value?: string): number {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (!normalized) return 1;
    if (normalized.includes('collecte')) return 1;
    if (normalized.includes('epargne')) return 2;
    return 1;
  }

  private async assertMobileDepositAllowed(
    idtype: number,
    manager?: EntityManager,
  ) {
    const typeCompte = manager
      ? await manager.findOne(Typecompte, { where: { idtype } })
      : await this.typeCompteRepository.findOneBy({ idtype });

    if (
      !typeCompte ||
      Number(typeCompte.mobile_sync_enabled) !== 1 ||
      Number(typeCompte.mobile_can_view) !== 1 ||
      Number(typeCompte.mobile_can_deposit) !== 1
    ) {
      throw new NotFoundException(
        'Compte non disponible pour versement mobile',
      );
    }
  }

  private async assertMobileOpeningAllowed(idtype: number) {
    const typeCompte = await this.typeCompteRepository.findOneBy({ idtype });
    if (
      !typeCompte ||
      Number(typeCompte.mobile_sync_enabled) !== 1 ||
      Number(typeCompte.mobile_can_open) !== 1
    ) {
      throw new NotFoundException(
        'Type de compte non disponible pour ouverture mobile',
      );
    }
    return typeCompte;
  }

  private async assertTypeNotOwned(idclient: number, idtype: number) {
    const existingCompte = await this.compteRepository.findOne({
      where: { idclient, idtype },
    });
    if (existingCompte) {
      throw new BadRequestException('Vous avez deja un compte de ce type.');
    }

    const pendingDemande = await this.ouvertureTamponRepository.findOne({
      where: [
        { idclient, idtype, statut_validation: 'pending_validation' },
        { idclient, idtype, statut_validation: 'payment_pending' },
      ],
    });
    if (pendingDemande) {
      throw new BadRequestException(
        'Une demande d ouverture est deja en attente pour ce type de compte.',
      );
    }
  }

  private openingMinimum(typeCompte: Typecompte) {
    return (
      Number(typeCompte.plafond || 0) + Number(typeCompte.frais_ouverture || 0)
    );
  }

  private openableTypeResponse(typeCompte: Typecompte) {
    const minimum = this.openingMinimum(typeCompte);
    return {
      idtype: typeCompte.idtype,
      libelle: typeCompte.libelle,
      description: typeCompte.description,
      plafond: Number(typeCompte.plafond || 0),
      frais_ouverture: Number(typeCompte.frais_ouverture || 0),
      montant_minimum: minimum,
    };
  }

  private normalizePieceIdentite(value?: string): string {
    const normalized = String(value || '')
      .trim()
      .toLowerCase();
    if (normalized === 'passeport') return 'Passeport';
    if (normalized === 'permis') return 'Permis';
    return 'CNI';
  }

  private async nextId(manager: EntityManager, table: string, column: string) {
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

  private buildOrderId(prefix: 'COLL' | 'OUV' | 'PRE') {
    return `${prefix}-${Date.now()}-${randomBytes(6).toString('hex')}`;
  }

  private isAcceptedPendingResult(payment: unknown) {
    return (
      payment !== null &&
      typeof payment === 'object' &&
      'provider_state' in payment &&
      payment.provider_state === 'accepted_pending'
    );
  }

  private parseStoredPayment(value?: string) {
    if (!value) return null;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }

  private normalizeOrderId(value: string, maxLength: number) {
    const raw = String(value || '')
      .trim()
      .toUpperCase();
    const compact = raw.replace(/[^A-Z0-9_-]/g, '');
    if (!compact) {
      return `ORD${Date.now().toString().slice(-8)}`;
    }
    if (compact.length <= maxLength) {
      return compact;
    }
    return compact.slice(0, maxLength);
  }

  private buildDepositNotificationMessage(payload: {
    amount: number;
    numeroCompte: string;
  }) {
    const rounded = Math.round(payload.amount);
    const formatted = new Intl.NumberFormat('fr-FR').format(rounded);
    return `Votre versement de ${formatted} XAF sur le compte ${payload.numeroCompte} a ete confirme.`;
  }

  private isMissingOperateurColumnError(error: unknown) {
    const mysqlCode = (error as { code?: string })?.code;
    return (
      error instanceof QueryFailedError &&
      (mysqlCode === 'ER_BAD_FIELD_ERROR' ||
        String((error as Error).message || '')
          .toLowerCase()
          .includes('operateur'))
    );
  }

  /**
   * Finalise de manière idempotente et sécurisée un versement resté en_attente.
   */
  async finalizePendingDeposit(
    reference: string,
    providerPayload?: unknown,
  ): Promise<{
    success: boolean;
    transaction: Transaction | null;
    message: string;
  }> {
    void providerPayload;
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { references: reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        this.logger.warn(
          `finalizePendingDeposit: transaction introuvable pour reference ${reference}`,
        );
        return {
          success: false,
          transaction: null,
          message: 'Transaction introuvable',
        };
      }

      // Idempotence : si déjà complétée, on ne recrédite pas le compte
      if (transaction.statut === 'complete') {
        this.logger.log(
          `finalizePendingDeposit: transaction ${reference} deja completee (idempotence)`,
        );
        return {
          success: true,
          transaction,
          message: 'Transaction deja validee',
        };
      }
      if (
        transaction.statut !== 'en_attente' ||
        transaction.type_transaction !== 'versement'
      ) {
        return {
          success: false,
          transaction,
          message: 'Transaction non eligible au credit',
        };
      }

      const compte = await manager.findOne(Compte, {
        where: { idcompte: transaction.idcompte },
        lock: { mode: 'pessimistic_write' },
      });

      if (!compte) {
        throw new NotFoundException(
          `Compte ${transaction.idcompte} introuvable pour finaliser la transaction`,
        );
      }

      const amount = parseFloat(transaction.montant_transaction);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('Montant de transaction invalide');
      }
      const currentSolde = parseFloat(compte.solde ?? '0');
      compte.solde = (currentSolde + amount).toFixed(2);
      await manager.save(compte);

      transaction.statut = 'complete';
      const savedTransaction = await manager.save(transaction);

      const idclient = Number(compte.idclient || 0);
      if (idclient > 0) {
        const notification = manager.create(Notification, {
          idclient,
          titre: 'Versement reussi',
          message: this.buildDepositNotificationMessage({
            amount,
            numeroCompte: compte.numero_compte,
          }),
          type: 'versement',
          lu: 0,
        });
        const savedNotification = await manager.save(notification);
        this.notificationsService.emitCreated(savedNotification);
      }

      this.logger.log(
        `finalizePendingDeposit: Transaction ${reference} confirmee et compte ${compte.numero_compte} credite de ${amount} XAF.`,
      );
      return {
        success: true,
        transaction: savedTransaction,
        message: 'Versement complete avec succes',
      };
    });
  }

  /**
   * Marque une transaction en_attente comme rejetée / annulée.
   */
  async failPendingDeposit(
    reference: string,
    providerPayload?: unknown,
  ): Promise<{
    success: boolean;
    transaction: Transaction | null;
    message: string;
  }> {
    void providerPayload;
    return this.dataSource.transaction(async (manager) => {
      const transaction = await manager.findOne(Transaction, {
        where: { references: reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        return {
          success: false,
          transaction: null,
          message: 'Transaction introuvable',
        };
      }

      if (transaction.statut === 'complete') {
        return {
          success: false,
          transaction,
          message: 'Impossible d annuler une transaction deja completee',
        };
      }

      transaction.statut = 'annulee';
      const saved = await manager.save(transaction);
      this.logger.warn(
        `failPendingDeposit: Transaction ${reference} marquee 'annulee'.`,
      );
      return {
        success: true,
        transaction: saved,
        message: 'Transaction marquee annulee',
      };
    });
  }

  /**
   * Traite un callback / webhook asynchrone envoyé par Paynote sur notifUrl.
   */
  async handlePaynoteWebhook(payload: any) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Payload webhook Paynote invalide');
    }

    const reference = this.extractStringField(payload, [
      'order_id',
      'orderId',
      'references',
      'request_id',
      'requestId',
    ]);
    const callbackMessageId = this.extractStringField(payload, [
      'MessageId',
      'message_id',
      'messageId',
      'paytoken',
      'payToken',
    ]);

    if (!reference && !callbackMessageId) {
      this.logger.warn('Paynote webhook ignore: aucun identifiant reconnu');
      return { status: 'ignored', reason: 'reference introuvable' };
    }

    let transaction: Transaction | null;
    if (reference) {
      transaction = await this.repository.findOne({
        where: { references: reference },
      });
    } else if (callbackMessageId) {
      transaction = await this.repository.findOne({
        where: { provider_message_id: callbackMessageId },
      });
    } else {
      return { status: 'ignored', reason: 'reference introuvable' };
    }
    if (!transaction) {
      return this.handlePaynoteOpeningWebhook(reference, callbackMessageId);
    }

    const providerMessageId =
      transaction.provider_message_id || callbackMessageId;
    if (!providerMessageId) {
      return { status: 'acknowledged', outcome: 'pending' };
    }
    const transactionReference = transaction.references;
    if (!transactionReference) {
      return { status: 'ignored', reason: 'order_id introuvable' };
    }

    let verifiedPayload: unknown;
    const operator = String(transaction.operateur || '').toLowerCase();
    if (operator.includes('om') || operator.includes('orange')) {
      verifiedPayload = await this.paynoteService.orangePaymentStatus({
        messageId: providerMessageId,
      });
    } else if (operator.includes('momo') || operator.includes('mtn')) {
      verifiedPayload = await this.paynoteService.mtnPaymentStatus({
        messageId: providerMessageId,
      });
    } else {
      this.logger.warn(
        `Paynote webhook ignore: operateur inconnu pour transaction ${transaction.idtransaction}`,
      );
      return { status: 'ignored', reason: 'operateur inconnu' };
    }

    const verifiedOrderId = this.extractStringField(verifiedPayload, [
      'order_id',
      'orderId',
    ]);
    if (verifiedOrderId && verifiedOrderId !== transactionReference) {
      throw new BadGatewayException(
        'Reference Paynote incoherente avec la transaction en attente.',
      );
    }
    if (!transaction.provider_message_id) {
      if (!callbackMessageId || verifiedOrderId !== transactionReference) {
        return {
          status: 'ignored',
          reason: 'message_id non rattache a la transaction',
        };
      }
      transaction.provider_message_id = callbackMessageId;
      await this.repository.update(transaction.idtransaction, {
        provider_message_id: callbackMessageId,
      });
    }

    const providerAmount = this.extractStringField(verifiedPayload, ['amount']);
    if (
      providerAmount &&
      Number(providerAmount) !== Number(transaction.montant_transaction)
    ) {
      this.logger.error(
        `Paynote webhook refuse: montant incoherent pour transaction ${transaction.idtransaction}`,
      );
      throw new BadGatewayException(
        'Montant Paynote incoherent avec la transaction en attente.',
      );
    }

    const decision = this.getPaymentDecision(verifiedPayload);
    this.logger.log(
      `Paynote webhook verifie: transaction=${transaction.idtransaction}, decision=${decision}`,
    );

    if (decision === 'success') {
      const result = await this.finalizePendingDeposit(
        transactionReference,
        verifiedPayload,
      );
      return { status: 'processed', outcome: 'success', details: result };
    }

    if (decision === 'failed') {
      const result = await this.failPendingDeposit(
        transactionReference,
        verifiedPayload,
      );
      return { status: 'processed', outcome: 'failed', details: result };
    }

    return { status: 'acknowledged', outcome: 'pending' };
  }

  private async handlePaynoteOpeningWebhook(
    reference: string | null,
    callbackMessageId: string | null,
  ) {
    const opening = reference
      ? await this.ouvertureTamponRepository.findOne({
          where: { references: reference },
        })
      : callbackMessageId
        ? await this.ouvertureTamponRepository.findOne({
            where: { provider_message_id: callbackMessageId },
          })
        : null;
    if (opening) {
      return this.reconcilePaynoteOpening(
        opening,
        callbackMessageId,
        async () => this.ouvertureTamponRepository.save(opening),
      );
    }

    const preopening = reference
      ? await this.preouvertureTamponRepository.findOne({
          where: { references: reference },
        })
      : callbackMessageId
        ? await this.preouvertureTamponRepository.findOne({
            where: { provider_message_id: callbackMessageId },
          })
        : null;
    if (preopening) {
      return this.reconcilePaynoteOpening(
        preopening,
        callbackMessageId,
        async () => this.preouvertureTamponRepository.save(preopening),
      );
    }

    this.logger.warn('Paynote webhook ignore: operation introuvable');
    return { status: 'ignored', reason: 'operation introuvable' };
  }

  private async reconcilePaynoteOpening<T extends PaynotePendingOpening>(
    demande: T,
    callbackMessageId: string | null,
    save: () => Promise<unknown>,
  ) {
    const messageId = demande.provider_message_id || callbackMessageId;
    if (!messageId) {
      return { status: 'acknowledged', outcome: 'pending' };
    }

    const operator = String(demande.operateur || '').toLowerCase();
    const verifiedPayload =
      operator.includes('om') || operator.includes('orange')
        ? await this.paynoteService.orangePaymentStatus({ messageId })
        : operator.includes('momo') || operator.includes('mtn')
          ? await this.paynoteService.mtnPaymentStatus({ messageId })
          : null;
    if (!verifiedPayload) {
      return { status: 'ignored', reason: 'operateur inconnu' };
    }

    const verifiedOrderId = this.extractStringField(verifiedPayload, [
      'order_id',
      'orderId',
    ]);
    if (verifiedOrderId && verifiedOrderId !== demande.references) {
      throw new BadGatewayException(
        'Reference Paynote incoherente avec la demande d ouverture.',
      );
    }
    if (!demande.provider_message_id) {
      if (!callbackMessageId || verifiedOrderId !== demande.references) {
        return {
          status: 'ignored',
          reason: 'message_id non rattache a la demande',
        };
      }
      demande.provider_message_id = callbackMessageId;
    }

    const providerAmount = this.extractStringField(verifiedPayload, ['amount']);
    if (
      providerAmount &&
      Number(providerAmount) !== Number(demande.montant_initial)
    ) {
      throw new BadGatewayException(
        'Montant Paynote incoherent avec la demande d ouverture.',
      );
    }

    const decision = this.getPaymentDecision(verifiedPayload);
    demande.payment_json = JSON.stringify(verifiedPayload);
    demande.updated_at = new Date();
    if (decision === 'success') {
      demande.statut_validation = 'pending_validation';
      demande.message_validation =
        'Paiement confirme. Demande en attente de validation administrative.';
    } else if (decision === 'failed') {
      demande.statut_validation = 'payment_failed';
      demande.message_validation = 'Paiement refuse par l operateur.';
    } else {
      demande.statut_validation = 'payment_pending';
      demande.message_validation = 'Confirmation operateur en attente.';
    }
    await save();

    return {
      status:
        decision === 'success' || decision === 'failed'
          ? 'processed'
          : 'acknowledged',
      outcome: decision,
    };
  }

  /**
   * Vérifie et réconcilie le statut d'une transaction à la demande.
   */
  async recheckTransactionStatus(
    references: string,
    authenticatedClientId?: number,
  ) {
    const transaction = await this.repository.findOne({
      where: { references },
    });

    if (!transaction) {
      throw new NotFoundException(
        `Transaction avec reference ${references} introuvable`,
      );
    }

    if (authenticatedClientId) {
      const compte = await this.compteRepository.findOne({
        where: { idcompte: transaction.idcompte },
      });
      if (!compte || compte.idclient !== authenticatedClientId) {
        throw new UnauthorizedException(
          'Non autorise a consulter cette transaction',
        );
      }
    }

    if (transaction.statut === 'complete') {
      return {
        status: 'complete',
        message: 'Transaction deja confirmee et compte credite',
        transaction,
      };
    }

    if (transaction.statut === 'annulee') {
      return {
        status: 'failed',
        message: 'Transaction annulee',
        transaction,
      };
    }

    const operator = (transaction.operateur || '').toLowerCase();
    const providerMessageId = transaction.provider_message_id;
    if (!providerMessageId) {
      return {
        status: 'pending',
        message:
          'Identifiant Paynote indisponible. La transaction attend le webhook operateur.',
        transaction,
      };
    }
    let statusPayload: unknown;

    try {
      if (operator.includes('om') || operator.includes('orange')) {
        statusPayload = await this.paynoteService.orangePaymentStatus({
          messageId: providerMessageId,
        });
      } else if (operator.includes('momo') || operator.includes('mtn')) {
        statusPayload = await this.paynoteService.mtnPaymentStatus({
          messageId: providerMessageId,
        });
      } else {
        throw new BadRequestException(
          'Operateur Paynote inconnu pour cette transaction.',
        );
      }
    } catch (err) {
      this.logger.warn(
        `recheckTransactionStatus: impossible d interroger le statut operateur pour ${references}: ${(err as Error)?.message}`,
      );
      return {
        status: 'pending',
        message: 'Statut en cours de traitement par l operateur',
        transaction,
      };
    }

    const providerAmount = this.extractStringField(statusPayload, ['amount']);
    const providerOrderId = this.extractStringField(statusPayload, [
      'order_id',
      'orderId',
    ]);
    if (providerOrderId && providerOrderId !== references) {
      throw new BadGatewayException(
        'Reference Paynote incoherente avec la transaction en attente.',
      );
    }
    if (
      providerAmount &&
      Number(providerAmount) !== Number(transaction.montant_transaction)
    ) {
      throw new BadGatewayException(
        'Montant Paynote incoherent avec la transaction en attente.',
      );
    }

    const decision = this.getPaymentDecision(statusPayload);

    if (decision === 'success') {
      const finalized = await this.finalizePendingDeposit(
        references,
        statusPayload,
      );
      return {
        status: 'complete',
        message: 'Paiement confirme avec succes. Votre compte a ete credite.',
        transaction: finalized.transaction || transaction,
        statusPayload,
      };
    }

    if (decision === 'failed') {
      await this.failPendingDeposit(references, statusPayload);
      return {
        status: 'failed',
        message: 'Paiement rejete par l operateur',
        transaction,
        statusPayload,
      };
    }

    return {
      status: 'pending',
      message: 'Paiement toujours en attente de confirmation sur le telephone',
      transaction,
      statusPayload,
    };
  }
}
