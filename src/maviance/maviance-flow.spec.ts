import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, BadGatewayException } from '@nestjs/common';
import { MaviancePaymentService } from './maviance-payment.service';
import { MavianceVerificationService } from './maviance-verification.service';
import { MavianceTransaction } from '../entities/maviance-transaction.entity';
import { MavianceServiceCache } from '../entities/maviance-service-cache.entity';
import { MavianceClient } from './maviance.client';
import { Compte } from '../entities/compte.entity';
import { Transaction as CoreTransaction } from '../entities/transaction.entity';
import { Notification as ClientNotification } from '../entities/notification.entity';

describe('Maviance Integration Flow', () => {
  let paymentService: MaviancePaymentService;
  let verificationService: MavianceVerificationService;
  let clientMock: jest.Mocked<MavianceClient>;

  // Mock repositories
  const txRepoMock = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((tx) => Promise.resolve(tx)),
    findOne: jest.fn(),
  };

  const cacheRepoMock = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  // Mock Entity Manager & DataSource
  const emMock = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    create: jest.fn().mockImplementation((cls, dto) => dto),
  } as unknown as jest.Mocked<EntityManager>;

  const dataSourceMock = {
    transaction: jest.fn().mockImplementation((cb) => cb(emMock)),
    manager: emMock,
  } as unknown as jest.Mocked<DataSource>;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    const clientMockProvider = {
      provide: MavianceClient,
      useValue: {
        request: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaviancePaymentService,
        MavianceVerificationService,
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        clientMockProvider,
        {
          provide: getRepositoryToken(MavianceTransaction),
          useValue: txRepoMock,
        },
        {
          provide: getRepositoryToken(MavianceServiceCache),
          useValue: cacheRepoMock,
        },
      ],
    }).compile();

    paymentService = module.get<MaviancePaymentService>(MaviancePaymentService);
    verificationService = module.get<MavianceVerificationService>(MavianceVerificationService);
    clientMock = module.get(MavianceClient);
  });

  it('1. should succeed with quote request (quote OK)', async () => {
    const dto = {
      payItemId: 10023,
      amount: 1500,
      idcompte: 4,
    };
    clientMock.request.mockResolvedValue({
      quoteId: 'Q-98765',
      amount: 1500,
      fee: 50,
    });

    const result = await paymentService.requestQuote(dto, 4, 1, 1);

    expect(result.quoteId).toBe('Q-98765');
    expect(clientMock.request).toHaveBeenCalledWith('POST', '/quotestd', expect.any(Object));
    expect(txRepoMock.create).toHaveBeenCalled();
    expect(txRepoMock.save).toHaveBeenCalled();
  });

  it('2. should initiate a payment successfully in pending state (collect PENDING)', async () => {
    const dto = {
      quoteId: 'Q-98765',
      idcompte: 4,
      customerPhonenumber: '670000000',
      customerEmailaddress: 'client@gmail.com',
    };

    const localTx = {
      reference: 'MAV-TEMP-1',
      quoteId: 'Q-98765',
      idcompte: 4,
      amount: 1500,
      status: 'QUOTED',
    };

    txRepoMock.findOne.mockResolvedValue(localTx);
    clientMock.request.mockResolvedValue({
      ptn: 'PTN-4455',
      status: 'PENDING',
      amount: 1500,
      payItemId: 10023,
    });

    const result = await paymentService.collect(dto, 1, 1);

    expect(result.status).toBe('PENDING');
    expect(result.ptn).toBe('PTN-4455');
    expect(txRepoMock.save).toHaveBeenCalled();
  });

  it('3. should process callback and credit the account (callback SUCCESS)', async () => {
    const localTx = {
      reference: 'MAV-1234',
      quoteId: 'Q-98765',
      idcompte: 4,
      amount: 1500,
      status: 'PENDING',
      idclient: 2,
    };
    const compte = {
      idcompte: 4,
      solde: '10000.00',
      numero_compte: '12345678',
      idclient: 2,
    };

    // Mock entity manager search
    emMock.findOne.mockImplementation(async (entityCls, options: any) => {
      if (entityCls === MavianceTransaction) {
        return localTx;
      }
      if (entityCls === Compte) {
        return compte;
      }
      return null;
    });

    await paymentService.handleWebhook({
      trid: 'MAV-1234',
      ptn: 'PTN-4455',
      status: 'SUCCESS',
    });

    // Check account credit logic
    expect(compte.solde).toBe('11500.00'); // 10000 + 1500
    expect(emMock.save).toHaveBeenCalledWith(compte);
    
    // Check core ledger creation
    expect(emMock.create).toHaveBeenCalledWith(CoreTransaction, expect.objectContaining({
      montant_transaction: '1500.00',
      type_transaction: 'versement',
      operateur: 'maviance',
    }));

    // Check notification creation
    expect(emMock.create).toHaveBeenCalledWith(ClientNotification, expect.objectContaining({
      titre: 'Versement réussi (Maviance)',
      type: 'versement',
    }));

    expect(localTx.status).toBe('SUCCESS');
  });

  it('4. should manually verify a transaction and update status (verify SUCCESS)', async () => {
    const localTx = {
      reference: 'MAV-1234',
      quoteId: 'Q-98765',
      idcompte: 4,
      amount: 1500,
      status: 'PENDING',
      ptn: 'PTN-4455',
    };
    const compte = {
      idcompte: 4,
      solde: '10000.00',
      numero_compte: '12345678',
      idclient: 2,
    };

    txRepoMock.findOne.mockResolvedValue(localTx);
    clientMock.request.mockResolvedValue({
      ptn: 'PTN-4455',
      status: 'SUCCESS',
    });

    // Mock entity manager search
    emMock.findOne.mockImplementation(async (entityCls, options: any) => {
      if (entityCls === MavianceTransaction) {
        return localTx;
      }
      if (entityCls === Compte) {
        return compte;
      }
      return null;
    });

    const result = await verificationService.manualVerify('MAV-1234');

    expect(result.status).toBe('SUCCESS');
    expect(compte.solde).toBe('11500.00');
  });

  it('5. should reject collect standard and map insufficient balance error (703108)', async () => {
    const dto = {
      quoteId: 'Q-98765',
      idcompte: 4,
      customerPhonenumber: '670000000',
      customerEmailaddress: 'client@gmail.com',
    };

    txRepoMock.findOne.mockResolvedValue({
      reference: 'MAV-TEMP-1',
      quoteId: 'Q-98765',
      idcompte: 4,
      status: 'QUOTED',
    });

    // Mock client throwing an error containing S3P API code 703108
    clientMock.request.mockRejectedValue(
      new BadGatewayException({
        message: 'Insufficient balance',
        code: 703108,
        raw: { errorCode: 703108, errorMessage: 'API Insufficient balance' },
      }),
    );

    await expect(paymentService.collect(dto, 1, 1)).rejects.toThrow(
      'Solde insuffisant pour effectuer le paiement.',
    );
  });

  it('6. should reject collect standard and map invalid PIN error (703203)', async () => {
    const dto = {
      quoteId: 'Q-98765',
      idcompte: 4,
      customerPhonenumber: '670000000',
      customerEmailaddress: 'client@gmail.com',
    };

    txRepoMock.findOne.mockResolvedValue({
      reference: 'MAV-TEMP-1',
      quoteId: 'Q-98765',
      idcompte: 4,
      status: 'QUOTED',
    });

    // Mock client throwing an error containing S3P API code 703203
    clientMock.request.mockRejectedValue(
      new BadGatewayException({
        message: 'Invalid PIN',
        code: 703203,
        raw: { errorCode: 703203, errorMessage: 'API Invalid PIN' },
      }),
    );

    await expect(paymentService.collect(dto, 1, 1)).rejects.toThrow(
      'Code PIN ou token de confirmation invalide.',
    );
  });
});
