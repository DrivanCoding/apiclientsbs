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
import { PaynoteService } from '../paynote/paynote.service';
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
    expect(mockNotificationsService.emitCreated).toHaveBeenCalled();
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
});
