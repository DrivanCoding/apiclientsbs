import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TransactionsService } from './transactions.service';
import { Transaction } from '../entities/transaction.entity';
import { Compte } from '../entities/compte.entity';
import { Client } from '../entities/client.entity';
import { Notification } from '../entities/notification.entity';
import { OuvertureCompteTampon } from '../entities/ouverture-compte-tampon.entity';
import { PreouvertureClientTampon } from '../entities/preouverture-client-tampon.entity';
import { Setting } from '../entities/setting.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { ListeOperator } from '../entities/liste-operator.entity';
import { Payment } from '../entities/payment.entity';
import {
  PaynoteService,
  PaynoteInvalidCredentialsError,
  PaynoteInvalidPaymentError,
} from '../paynote/paynote.service';
import { BadGatewayException } from '@nestjs/common';
import { MavianceClient } from '../maviance/maviance.client';
import { NotificationsService } from '../notifications/notifications.service';

describe('TransactionsService - Paynote Resilient Payment & Webhook', () => {
  let service: TransactionsService;
  let mockTxRepo: any;
  let mockCompteRepo: any;
  let mockPaynoteService: any;
  let mockNotificationsService: any;
  let mockDataSource: any;
  let mockOuvertureRepo: any;
  let mockPreouvertureRepo: any;

  beforeEach(async () => {
    mockTxRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((dto) => dto),
      update: jest.fn(),
    };

    mockCompteRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockPaynoteService = {
      orangePay: jest.fn(),
      orangePaymentStatus: jest.fn(),
      mtnPay: jest.fn(),
      mtnPaymentStatus: jest.fn(),
    };

    mockNotificationsService = {
      emitCreated: jest.fn(),
    };
    mockOuvertureRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
      update: jest.fn(),
    };
    mockPreouvertureRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
      update: jest.fn(),
    };

    const mockPaymentRepo = {
      findOneBy: jest.fn(),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
      find: jest.fn(async () => []),
      update: jest.fn(),
    };

    mockDataSource = {
      transaction: jest.fn(async (callback) => {
        const manager = {
          findOne: jest.fn(async (entity, options) => {
            if (entity === Transaction) {
              return mockTxRepo.findOne(options);
            }
            if (entity === Compte) {
              return mockCompteRepo.findOne(options);
            }
            return null;
          }),
          save: jest.fn(async (entity) => entity),
          create: jest.fn((entityClass, dto) => dto),
        };
        return callback(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: mockTxRepo },
        { provide: getRepositoryToken(Compte), useValue: mockCompteRepo },
        { provide: getRepositoryToken(Client), useValue: {} },
        { provide: getRepositoryToken(Notification), useValue: {} },
        {
          provide: getRepositoryToken(OuvertureCompteTampon),
          useValue: mockOuvertureRepo,
        },
        {
          provide: getRepositoryToken(PreouvertureClientTampon),
          useValue: mockPreouvertureRepo,
        },
        { provide: getRepositoryToken(Setting), useValue: {} },
        { provide: getRepositoryToken(Typecompte), useValue: {} },
        { provide: getRepositoryToken(ListeOperator), useValue: {} },
        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        { provide: PaynoteService, useValue: mockPaynoteService },
        { provide: MavianceClient, useValue: {} },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
  });

  it('returns only completed transactions for the mobile client history', async () => {
    const queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    mockTxRepo.createQueryBuilder = jest.fn(() => queryBuilder);

    await service.findByClient(42, undefined, undefined, true);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'transaction.statut = :statut',
      { statut: 'complete' },
    );
  });

  it('generates Orange-compatible order IDs of at most 20 characters', () => {
    const buildOrderId = (service as any).buildOrderId.bind(service) as (
      prefix: 'COLL' | 'OUV' | 'PRE',
    ) => string;

    for (const prefix of ['COLL', 'OUV', 'PRE'] as const) {
      const orderId = buildOrderId(prefix);
      expect(orderId).toMatch(new RegExp(`^${prefix}[a-z0-9]+$`));
      expect(orderId.length).toBeLessThanOrEqual(20);
    }
  });

  it('accepts a pre-opening with only the required client photo', async () => {
    jest.spyOn(service as any, 'normalizeOperator').mockResolvedValue('momo');
    jest
      .spyOn(service as any, 'assertMobileOpeningAllowed')
      .mockResolvedValue({ plafond: 0, frais_ouverture: 0 });
    jest
      .spyOn(service as any, 'collectWithConfiguredGateway')
      .mockResolvedValue({ provider_state: 'accepted_pending' });
    mockPreouvertureRepo.findOne.mockResolvedValue(null);

    await service.preouvertureWithDeposit(
      {
        nom: 'Client sans piece',
        telephone_principal: '670000000',
        montant_initial: 1000,
        operateur: 'momo',
        idag: 1,
        idtype: 1,
        references: 'PREPHOTOONLY1',
      },
      {
        photo_profil: [{ filename: 'profil.jpg', path: '/tmp/profil.jpg' }],
      },
    );

    expect(mockPreouvertureRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_profil: '/uploads/preouverture/profil.jpg',
        signature: undefined,
        photo_piece_recto: undefined,
        photo_piece_verso: undefined,
        type_piece: undefined,
        num_piece_identite: undefined,
      }),
    );
  });

  it('still rejects a pre-opening without the client photo', async () => {
    await expect(
      service.preouvertureWithDeposit({
        nom: 'Client sans photo',
        telephone_principal: '670000000',
        montant_initial: 1000,
        operateur: 'momo',
        idag: 1,
        idtype: 1,
      }),
    ).rejects.toThrow('La photo du client est obligatoire.');
  });

  it('finalizes a pending deposit, credits the account, and emits notification', async () => {
    const pendingTx: Partial<Transaction> = {
      idtransaction: 1,
      idcompte: 10,
      references: 'COLL-TEST-001',
      montant_transaction: '5000.00',
      statut: 'en_attente',
      type_transaction: 'versement',
    };

    const compte: Partial<Compte> = {
      idcompte: 10,
      numero_compte: 'SB00010',
      idclient: 99,
      solde: '10000.00',
    };

    mockTxRepo.findOne.mockResolvedValue(pendingTx);
    mockCompteRepo.findOne.mockResolvedValue(compte);

    const result = await service.finalizePendingDeposit('COLL-TEST-001');

    expect(result.success).toBe(true);
    expect(compte.solde).toBe('15000.00');
    expect(pendingTx.statut).toBe('complete');
    expect(pendingTx.statut_validation).toBe('pending_validation');
    expect(mockNotificationsService.emitCreated).toHaveBeenCalled();
  });

  it('marks a manually validated Core deposit as posted without changing the mobile balance', async () => {
    const transaction: Partial<Transaction> = {
      idtransaction: 6,
      idcompte: 60,
      montant_transaction: '2500.00',
      statut: 'complete',
      statut_validation: 'pending_validation',
      type_transaction: 'versement',
    };
    mockTxRepo.findOne.mockResolvedValue(transaction);

    const result = await service.applyCoreValidation(6, {
      status: 'posted',
      message: 'Validation manuelle',
    });

    expect(result.status).toBe('posted');
    expect(transaction.statut_validation).toBe('posted');
    expect(mockCompteRepo.findOne).not.toHaveBeenCalled();
  });

  it('reverses the displayed mobile balance and notifies the client on Core rejection', async () => {
    const transaction: Partial<Transaction> = {
      idtransaction: 7,
      idcompte: 70,
      montant_transaction: '3000.00',
      statut: 'complete',
      statut_validation: 'pending_validation',
      type_transaction: 'versement',
    };
    const compte: Partial<Compte> = {
      idcompte: 70,
      idclient: 700,
      numero_compte: 'SB00070',
      solde: '10000.00',
    };
    mockTxRepo.findOne.mockResolvedValue(transaction);
    mockCompteRepo.findOne.mockResolvedValue(compte);

    const result = await service.applyCoreValidation(7, {
      status: 'rejected',
      message: 'Justificatif invalide',
    });

    expect(result.status).toBe('rejected');
    expect(compte.solde).toBe('7000.00');
    expect(transaction.statut).toBe('complete');
    expect(transaction.statut_validation).toBe('rejected');
    expect(mockNotificationsService.emitCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        idclient: 700,
        titre: 'Versement rejete',
      }),
    );
  });

  it('does not reverse the mobile balance twice when a Core rejection is retried', async () => {
    const transaction: Partial<Transaction> = {
      idtransaction: 8,
      idcompte: 80,
      montant_transaction: '3000.00',
      statut: 'complete',
      statut_validation: 'rejected',
      type_transaction: 'versement',
    };
    mockTxRepo.findOne.mockResolvedValue(transaction);

    const result = await service.applyCoreValidation(8, {
      status: 'rejected',
      message: 'Nouvel essai',
    });

    expect(result.duplicate).toBe(true);
    expect(mockCompteRepo.findOne).not.toHaveBeenCalled();
    expect(mockNotificationsService.emitCreated).not.toHaveBeenCalled();
  });

  it('ensures idempotency by not re-crediting an already completed transaction', async () => {
    const completedTx: Partial<Transaction> = {
      idtransaction: 1,
      idcompte: 10,
      references: 'COLL-TEST-002',
      montant_transaction: '5000.00',
      statut: 'complete',
    };

    mockTxRepo.findOne.mockResolvedValue(completedTx);

    const result = await service.finalizePendingDeposit('COLL-TEST-002');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Transaction deja validee');
    expect(mockCompteRepo.save).not.toHaveBeenCalled();
  });

  it('processes incoming Paynote webhook and credits pending transaction on SUCCESSFUL status', async () => {
    const pendingTx: Partial<Transaction> = {
      idtransaction: 2,
      idcompte: 20,
      references: 'COLL-WEBHOOK-01',
      montant_transaction: '2500.00',
      statut: 'en_attente',
      type_transaction: 'versement',
      operateur: 'om',
      provider_message_id: 'MP25000123',
    };

    const compte: Partial<Compte> = {
      idcompte: 20,
      numero_compte: 'SB00020',
      idclient: 50,
      solde: '2000.00',
    };

    mockTxRepo.findOne.mockResolvedValue(pendingTx);
    mockCompteRepo.findOne.mockResolvedValue(compte);
    mockPaynoteService.orangePaymentStatus.mockResolvedValue({
      ErrorCode: 200,
      parameters: {
        status: 'SUCCESSFUL',
        amount: '2500',
      },
    });

    const webhookPayload = {
      ErrorCode: 200,
      Status: 'SUCCESSFUL',
      parameters: {
        order_id: 'COLL-WEBHOOK-01',
        MessageId: 'MP25000123',
        amount: '2500',
      },
    };

    const webhookResult = await service.handlePaynoteWebhook(webhookPayload);

    expect(webhookResult.status).toBe('processed');
    expect(webhookResult.outcome).toBe('success');
    expect(compte.solde).toBe('4500.00');
    expect(pendingTx.statut).toBe('complete');
    expect(mockPaynoteService.orangePaymentStatus).toHaveBeenCalledWith({
      messageId: 'MP25000123',
    });
  });

  it('rechecks transaction status and finalizes deposit if operator confirmed payment', async () => {
    const pendingTx: Partial<Transaction> = {
      idtransaction: 3,
      idcompte: 30,
      references: 'COLL-RECHECK-01',
      montant_transaction: '1000.00',
      statut: 'en_attente',
      type_transaction: 'versement',
      operateur: 'om',
      provider_message_id: 'MP25000123',
    };

    const compte: Partial<Compte> = {
      idcompte: 30,
      numero_compte: 'SB00030',
      idclient: 77,
      solde: '500.00',
    };

    mockTxRepo.findOne.mockResolvedValue(pendingTx);
    mockCompteRepo.findOne.mockResolvedValue(compte);

    mockPaynoteService.orangePaymentStatus.mockResolvedValue({
      ErrorCode: 200,
      parameters: {
        status: 'SUCCESSFUL',
        paytoken: 'MP25000123',
      },
    });

    const result = await service.recheckTransactionStatus(
      'COLL-RECHECK-01',
      77,
    );

    expect(result.status).toBe('complete');
    expect(compte.solde).toBe('1500.00');
    expect(pendingTx.statut).toBe('complete');
    expect(mockPaynoteService.orangePaymentStatus).toHaveBeenCalledWith({
      messageId: 'MP25000123',
    });
  });

  it('rechecks MTN (momo) transaction status via mtnPaymentStatus and never orangePaymentStatus', async () => {
    const pendingTx: Partial<Transaction> = {
      idtransaction: 33,
      idcompte: 30,
      references: 'COLL-RECHECK-MTN-01',
      montant_transaction: '1000.00',
      statut: 'en_attente',
      type_transaction: 'versement',
      operateur: 'momo',
      provider_message_id: 'MTN-MSG-789',
    };

    const compte: Partial<Compte> = {
      idcompte: 30,
      numero_compte: 'SB00030',
      idclient: 77,
      solde: '500.00',
    };

    mockTxRepo.findOne.mockResolvedValue(pendingTx);
    mockCompteRepo.findOne.mockResolvedValue(compte);

    mockPaynoteService.mtnPaymentStatus.mockResolvedValue({
      ErrorCode: 200,
      parameters: {
        status: 'SUCCESSFUL',
        amount: '1000',
      },
    });

    const result = await service.recheckTransactionStatus(
      'COLL-RECHECK-MTN-01',
      77,
    );

    expect(result.status).toBe('complete');
    expect(compte.solde).toBe('1500.00');
    expect(pendingTx.statut).toBe('complete');
    expect(mockPaynoteService.mtnPaymentStatus).toHaveBeenCalledWith({
      messageId: 'MTN-MSG-789',
    });
    expect(mockPaynoteService.orangePaymentStatus).not.toHaveBeenCalled();
  });

  it('handles Paynote webhook for MTN (momo) using mtnPaymentStatus and never orangePaymentStatus', async () => {
    const pendingTx: Partial<Transaction> = {
      idtransaction: 34,
      idcompte: 20,
      references: 'COLL-WEBHOOK-MTN-01',
      provider_message_id: 'MTN-MSG-456',
      montant_transaction: '2500.00',
      statut: 'en_attente',
      type_transaction: 'versement',
      operateur: 'momo',
    };

    const compte: Partial<Compte> = {
      idcompte: 20,
      numero_compte: 'SB00020',
      idclient: 88,
      solde: '2000.00',
    };

    mockTxRepo.findOne.mockResolvedValue(pendingTx);
    mockCompteRepo.findOne.mockResolvedValue(compte);
    mockPaynoteService.mtnPaymentStatus.mockResolvedValue({
      ErrorCode: 200,
      parameters: {
        status: 'SUCCESSFUL',
        amount: '2500',
      },
    });

    const webhookResult = await service.handlePaynoteWebhook({
      parameters: {
        order_id: 'COLL-WEBHOOK-MTN-01',
        MessageId: 'MTN-MSG-456',
        amount: '2500',
      },
    });

    expect(webhookResult.status).toBe('processed');
    expect(webhookResult.outcome).toBe('success');
    expect(compte.solde).toBe('4500.00');
    expect(pendingTx.statut).toBe('complete');
    expect(mockPaynoteService.mtnPaymentStatus).toHaveBeenCalledWith({
      messageId: 'MTN-MSG-456',
    });
    expect(mockPaynoteService.orangePaymentStatus).not.toHaveBeenCalled();
  });

  it('does not trust a successful webhook when Paynote still reports pending', async () => {
    const pendingTx: Partial<Transaction> = {
      idtransaction: 4,
      idcompte: 40,
      references: 'COLL-WEBHOOK-PENDING',
      provider_message_id: 'MP-PENDING-01',
      montant_transaction: '3000.00',
      statut: 'en_attente',
      type_transaction: 'versement',
      operateur: 'om',
    };
    mockTxRepo.findOne.mockResolvedValue(pendingTx);
    mockPaynoteService.orangePaymentStatus.mockResolvedValue({
      ErrorCode: 200,
      body: 'Pay Request Accepted',
      parameters: { status: 'PENDING', amount: '3000' },
    });

    const result = await service.handlePaynoteWebhook({
      Status: 'SUCCESSFUL',
      parameters: {
        order_id: 'COLL-WEBHOOK-PENDING',
        MessageId: 'MP-PENDING-01',
      },
    });

    expect(result).toMatchObject({
      status: 'acknowledged',
      outcome: 'pending',
    });
    expect(pendingTx.statut).toBe('en_attente');
    expect(mockCompteRepo.findOne).not.toHaveBeenCalled();
  });

  it('keeps an accepted Paynote deposit pending and does not credit the account', async () => {
    const pendingTx: Partial<Transaction> = {
      idtransaction: 5,
      idcompte: 50,
      references: 'COLL-ACCEPTED-PENDING',
      montant_transaction: '4000.00',
      statut: 'en_attente',
      type_transaction: 'versement',
      operateur: 'om',
    };
    mockTxRepo.findOne.mockResolvedValue(null);
    mockTxRepo.save.mockResolvedValue(pendingTx);
    mockCompteRepo.findOne.mockResolvedValue({
      idcompte: 50,
      idclient: 88,
      solde: '1000.00',
    });
    jest.spyOn(service as any, 'normalizeOperator').mockResolvedValue('om');
    jest
      .spyOn(service as any, 'findActiveOperatorLedger')
      .mockResolvedValue(null);
    jest
      .spyOn(service as any, 'assertMobileDepositAllowed')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'collectWithConfiguredGateway')
      .mockResolvedValue({ provider_state: 'accepted_pending' });
    const finalizeSpy = jest.spyOn(service, 'finalizePendingDeposit');

    const result = await service.deposit(
      {
        idcompte: 50,
        montant_transaction: 4000,
        operateur: 'om',
        numero_telephone: '690000000',
        references: 'COLL-ACCEPTED-PENDING',
        idclient: 88,
      },
      88,
    );

    expect(result.status).toBe('pending');
    expect(finalizeSpy).not.toHaveBeenCalled();
  });

  it('moves a paid account opening from payment_pending to administrative validation', async () => {
    const demande: Partial<OuvertureCompteTampon> = {
      id: 8,
      references: 'OUV-PENDING-01',
      provider_message_id: 'MP-OUV-01',
      operateur: 'om',
      montant_initial: '5000.00',
      statut_validation: 'payment_pending',
      updated_at: new Date(),
    };
    mockTxRepo.findOne.mockResolvedValue(null);
    mockOuvertureRepo.findOne.mockResolvedValue(demande);
    mockPaynoteService.orangePaymentStatus.mockResolvedValue({
      ErrorCode: 200,
      parameters: {
        status: 'SUCCESSFUL',
        order_id: 'OUV-PENDING-01',
        amount: '5000',
      },
    });

    const result = await service.handlePaynoteWebhook({
      parameters: {
        order_id: 'OUV-PENDING-01',
        MessageId: 'MP-OUV-01',
      },
    });

    expect(result).toMatchObject({
      status: 'processed',
      outcome: 'success',
    });
    expect(demande.statut_validation).toBe('pending_validation');
    expect(mockOuvertureRepo.save).toHaveBeenCalledWith(demande);
  });

  describe('Separation des erreurs dans deposit (cles invalides vs paiement invalide)', () => {
    it('echoue immediatement un depot Orange avec code INVALID_CREDENTIALS si les cles sont invalides', async () => {
      const pendingTx: any = {
        idtransaction: 10,
        idcompte: 50,
        references: 'COLL-BAD-KEY',
        montant_transaction: '1000.00',
        statut: 'en_attente',
        type_transaction: 'versement',
        operateur: 'om',
      };
      mockTxRepo.findOne.mockResolvedValue(null);
      mockTxRepo.save.mockResolvedValue(pendingTx);
      mockCompteRepo.findOne.mockResolvedValue({
        idcompte: 50,
        idclient: 88,
        solde: '1000.00',
      });
      jest.spyOn(service as any, 'normalizeOperator').mockResolvedValue('om');
      jest.spyOn(service as any, 'findActiveOperatorLedger').mockResolvedValue(null);
      jest.spyOn(service as any, 'assertMobileDepositAllowed').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getConfiguredPaymentGateway').mockReturnValue('paynote');

      mockPaynoteService.orangePay.mockRejectedValue(
        new PaynoteInvalidCredentialsError(
          '[CLE_INVALIDE] Clés marchand Paynote Orange refusées lors de la requête de paiement.',
          401,
          'orange:pay',
          { code: '900901' },
          'merchant_keys',
        ),
      );

      const failSpy = jest.spyOn(service, 'failPendingDeposit');

      try {
        await service.deposit(
          {
            idcompte: 50,
            montant_transaction: 1000,
            operateur: 'om',
            numero_telephone: '692000000',
            references: 'COLL-BAD-KEY',
            idclient: 88,
          },
          88,
        );
        fail('Devait lever BadGatewayException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadGatewayException);
        const res = err.getResponse();
        expect(res.error).toBe('INVALID_CREDENTIALS');
        expect(res.category).toBe('INVALID_CREDENTIALS');
        expect(res.message).toContain('[CLE_INVALIDE]');
        expect(failSpy).toHaveBeenCalledWith(
          'COLL-BAD-KEY',
          expect.objectContaining({ error: expect.stringContaining('[CLE_INVALIDE]') }),
        );
      }
    });

    it('echoue immediatement un depot Orange avec code INVALID_PAYMENT si le solde du client est insuffisant', async () => {
      const pendingTx: any = {
        idtransaction: 11,
        idcompte: 50,
        references: 'COLL-BAD-FUNDS',
        montant_transaction: '25000.00',
        statut: 'en_attente',
        type_transaction: 'versement',
        operateur: 'om',
      };
      mockTxRepo.findOne.mockResolvedValue(null);
      mockTxRepo.save.mockResolvedValue(pendingTx);
      mockCompteRepo.findOne.mockResolvedValue({
        idcompte: 50,
        idclient: 88,
        solde: '1000.00',
      });
      jest.spyOn(service as any, 'normalizeOperator').mockResolvedValue('om');
      jest.spyOn(service as any, 'findActiveOperatorLedger').mockResolvedValue(null);
      jest.spyOn(service as any, 'assertMobileDepositAllowed').mockResolvedValue(undefined);
      jest.spyOn(service as any, 'getConfiguredPaymentGateway').mockReturnValue('paynote');

      mockPaynoteService.orangePay.mockRejectedValue(
        new PaynoteInvalidPaymentError(
          '[PAIEMENT_INVALIDE] Solde Orange Money insuffisant sur le compte du client pour effectuer cette transaction.',
          400,
          'orange:pay',
          { code: '400' },
          'INSUFFICIENT_BALANCE',
        ),
      );

      const failSpy = jest.spyOn(service, 'failPendingDeposit');

      try {
        await service.deposit(
          {
            idcompte: 50,
            montant_transaction: 25000,
            operateur: 'om',
            numero_telephone: '692000000',
            references: 'COLL-BAD-FUNDS',
            idclient: 88,
          },
          88,
        );
        fail('Devait lever BadGatewayException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(BadGatewayException);
        const res = err.getResponse();
        expect(res.error).toBe('INVALID_PAYMENT');
        expect(res.category).toBe('INVALID_PAYMENT');
        expect(res.reason).toBe('INSUFFICIENT_BALANCE');
        expect(res.message).toContain('[PAIEMENT_INVALIDE]');
        expect(failSpy).toHaveBeenCalledWith(
          'COLL-BAD-FUNDS',
          expect.objectContaining({ error: expect.stringContaining('[PAIEMENT_INVALIDE]') }),
        );
      }
    });

    it('retourne un message clair et classe l erreur lors de recheckTransactionStatus en echec', async () => {
      const pendingTx: any = {
        idtransaction: 12,
        idcompte: 50,
        references: 'COLL-RECHECK-FAIL',
        montant_transaction: '3000.00',
        statut: 'en_attente',
        type_transaction: 'versement',
        operateur: 'om',
        provider_message_id: 'MP-RECHECK-01',
      };
      mockTxRepo.findOne.mockResolvedValue(pendingTx);
      mockPaynoteService.orangePaymentStatus.mockResolvedValue({
        ErrorCode: 200,
        parameters: {
          status: 'FAILED',
          order_id: 'COLL-RECHECK-FAIL',
          amount: '3000',
          message: 'Transaction cancelled by user or wrong pin',
        },
      });

      const failSpy = jest.spyOn(service, 'failPendingDeposit');
      const result = await service.recheckTransactionStatus('COLL-RECHECK-FAIL');

      expect(result.status).toBe('failed');
      expect(result.message).toContain('[PAIEMENT_INVALIDE]');
      expect(result.message).toContain('refusé ou annulé par le client');
      expect(failSpy).toHaveBeenCalledWith(
        'COLL-RECHECK-FAIL',
        expect.objectContaining({ error: expect.stringContaining('[PAIEMENT_INVALIDE]') }),
      );
    });
  });
});
