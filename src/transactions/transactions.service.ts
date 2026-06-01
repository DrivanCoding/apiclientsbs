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
import { Setting } from '../entities/setting.entity';
import { Transaction } from '../entities/transaction.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { PaynoteService } from '../paynote/paynote.service';
import { DepositDto } from './dto/deposit.dto';
import { PreouvertureDto } from './dto/preouverture.dto';

const SYSTEM_USER_ID = 1;
type PaymentDecision = 'success' | 'pending' | 'failed' | 'unknown';
type UploadedPreouvertureFiles = Record<
  string,
  Array<{ filename: string; path: string }>
>;

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
    @InjectRepository(Setting)
    private readonly settingRepository: Repository<Setting>,
    @InjectRepository(Typecompte)
    private readonly typeCompteRepository: Repository<Typecompte>,
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
    const normalizedOperator = await this.normalizeOperator(dto.operateur);
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

    return this.dataSource.transaction(async (manager) => {
      const compte = await manager.findOne(Compte, {
        where: { idcompte: dto.idcompte },
      });

      if (!compte || compte.idclient !== effectiveClientId) {
        throw new NotFoundException('Compte introuvable');
      }
      await this.assertMobileDepositAllowed(compte.idtype, manager);

      const currentSolde = parseFloat(compte.solde ?? '0');
      const newSolde = currentSolde + dto.montant_transaction;

      const transaction = manager.create(Transaction, {
        iduser: dto.iduser ?? SYSTEM_USER_ID,
        idcompte: compte.idcompte,
        montant_transaction: dto.montant_transaction.toFixed(2),
        type_transaction: 'versement',
        operateur: normalizedOperator,
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
    try {
      return await this.repository
        .createQueryBuilder('transaction')
        .innerJoin(Compte, 'compte', 'compte.idcompte = transaction.idcompte')
        .innerJoin(
          Typecompte,
          'typecompte',
          'typecompte.idtype = compte.idtype',
        )
        .where('compte.idclient = :idclient', { idclient })
        .andWhere('typecompte.mobile_sync_enabled = 1')
        .andWhere('typecompte.mobile_can_view = 1')
        .orderBy('transaction.date_transaction', 'DESC')
        .getMany();
    } catch (error) {
      if (!this.isMissingOperateurColumnError(error)) {
        throw error;
      }

      // Backward compatibility when migration for transaction.operateur is not applied.
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
        ORDER BY t.date_transaction DESC
        `,
        [idclient],
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
    const photoCni = this.uploadedFileUrl(files, 'photo_cni');

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

    if (dto.type_piece && !photoCni) {
      this.logger.warn('Pre-ouverture avec piece sans photo CNI');
      throw new BadRequestException(
        'La photo de la piece d identite est obligatoire.',
      );
    }

    const normalizedOperator = await this.normalizeOperator(dto.operateur);
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

    return this.dataSource.transaction(async (manager) => {
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
        photo_identite: photoProfil,
        signature,
        commentaires: photoCni
          ? JSON.stringify({ photo_cni: photoCni })
          : undefined,
        idag: dto.idag,
      });
      const savedClient = await manager.save(client);

      const compte = manager.create(Compte, {
        idcompte: nextCompteId,
        idtype,
        solde: dto.montant_initial.toFixed(2),
        idclient: savedClient.idclient,
        idag: dto.idag,
        numero_compte: this.buildNumeroCompte(
          nextCompteId,
          savedClient.idclient,
        ),
      });
      const savedCompte = await manager.save(compte);

      const transaction = manager.create(Transaction, {
        iduser: SYSTEM_USER_ID,
        idcompte: savedCompte.idcompte,
        montant_transaction: dto.montant_initial.toFixed(2),
        type_transaction: 'versement',
        operateur: normalizedOperator,
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
        const payToken = this.extractStringField(init, ['payToken']);
        if (!payToken) {
          throw new BadGatewayException(
            'Initialisation Orange Money invalide (payToken absent)',
          );
        }

        const payment = await this.paynoteService.pay({
          amount: payload.montant,
          subscriberMsisdn: payload.numeroTelephone,
          orderId: this.normalizeOrderId(payload.references, 20),
          description: payload.description,
          payToken,
        });

        const decision = this.getPaymentDecision(payment);
        if (decision === 'success') {
          return { init, payment };
        }
        if (decision === 'failed') {
          throw new BadGatewayException(
            `Paiement Orange rejete: ${this.summarizePaymentState(payment)}`,
          );
        }

        const confirmed = await this.pollPaymentStatus(async () =>
          this.paynoteService.getPaymentStatus(payToken),
        );
        if (confirmed.decision !== 'success') {
          throw new BadGatewayException(
            `Paiement Orange en attente/non confirme: ${this.summarizePaymentState(
              confirmed.payload,
            )}`,
          );
        }

        return { init, payment, status: confirmed.payload };
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

      const confirmed = await this.pollPaymentStatus(async () =>
        this.paynoteService.mtnPaymentStatus({ messageId }),
      );
      if (confirmed.decision === 'success') {
        return { payment, status: confirmed.payload };
      }

      // On MTN, Paynote can keep returning "Pay Request Accepted" while the user
      // has already validated on handset. We accept provider-level 200/accepted
      // to avoid false negatives and keep business flow moving.
      if (
        confirmed.decision === 'pending' &&
        this.isProviderAccepted(confirmed.payload)
      ) {
        return {
          payment,
          status: confirmed.payload,
          provider_state: 'accepted_pending',
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

  private async pollPaymentStatus(
    fetchStatus: () => Promise<unknown>,
  ): Promise<{ decision: PaymentDecision; payload: unknown }> {
    const attempts = Math.max(
      1,
      Number(process.env.PAYNOTE_STATUS_POLL_ATTEMPTS ?? 20),
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
      throw new NotFoundException('Compte non disponible pour versement mobile');
    }
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

  private buildOrderId() {
    const now = Date.now();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    return `PRE-${now}-${random}`;
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
}
