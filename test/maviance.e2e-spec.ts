import './../src/env';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { MavianceClient } from './../src/maviance/maviance.client';
import { DataSource } from 'typeorm';
import { Client } from './../src/entities/client.entity';
import { Compte } from './../src/entities/compte.entity';
import { MavianceTransaction } from './../src/entities/maviance-transaction.entity';
import { Transaction as CoreTransaction } from './../src/entities/transaction.entity';
import { Notification as ClientNotification } from './../src/entities/notification.entity';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

describe('Maviance Controller (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let clientMock: jest.Mocked<MavianceClient>;

  const TEST_CLIENT_ID = 9999;
  const TEST_COMPTE_ID = 9999;
  const TEST_USER_ID = 1;

  let jwtSecret: string;
  let adminToken: string;
  let clientToken: string;

  let testQuoteId = 'Q-E2E-DEFAULT';

  beforeAll(async () => {
    // 1. Configure the JWT Secret and tokens
    jwtSecret = process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me';
    adminToken = jwt.sign(
      {
        sub: TEST_USER_ID,
        email: 'admin@test.local',
        accountType: 'admin',
        role: 'ADMIN',
        roles: ['ADMIN'],
      },
      jwtSecret,
    );
    clientToken = jwt.sign(
      {
        sub: TEST_CLIENT_ID,
        email: 'client@test.local',
        accountType: 'client',
        roles: ['CLIENT'],
      },
      jwtSecret,
    );

    // 2. Setup testing module with mock MavianceClient using a deterministic router
    clientMock = {
      request: jest.fn().mockImplementation((method: string, path: string, params: any) => {
        const cleanPath = '/' + path.replace(/^\/+/, '');
        if (method === 'GET' && cleanPath === '/service') {
          return Promise.resolve([
            {
              payItemId: 10023,
              serviceId: 20053,
              name: 'MTN MoMo E2E',
              category: 'RECH',
              merchant: 'MTN',
            },
          ]);
        }
        if (method === 'POST' && cleanPath === '/quotestd') {
          return Promise.resolve({
            quoteId: testQuoteId,
            amount: params?.amount || 1500,
            fee: 50,
          });
        }
        if (method === 'POST' && cleanPath === '/collectstd') {
          return Promise.resolve({
            ptn: 'PTN-E2E-PENDING',
            status: 'PENDING',
            amount: 1500,
            payItemId: 10023,
          });
        }
        if (method === 'GET' && cleanPath === '/verifytx') {
          return Promise.resolve({
            ptn: 'PTN-VERIFY-SUCCESS',
            status: 'SUCCESS',
            amount: 2000,
          });
        }
        return Promise.resolve({});
      }),
    } as any;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MavianceClient)
      .useValue(clientMock)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    await app.init();

    dataSource = app.get(DataSource);

    // 3. Clear existing test data if any from previous failed runs
    await cleanDatabase(dataSource);

    // 4. Seed database with E2E test client and bank account
    await dataSource.transaction(async (manager) => {
      const client = manager.create(Client, {
        idclient: TEST_CLIENT_ID,
        code_client: 'C-TEST-E2E',
        nom: 'TEST',
        prenom: 'Maviance E2E',
        piece_identite: 'CNI',
        num_piece_identite: 'E2E-9999',
        adresse: 'Test Boulevard',
        code_postal: '0000',
        ville: 'Douala',
        email: 'client@test.local',
        telephone_principal: '670000999',
        is_first_login: 0,
      });
      await manager.save(client);

      const compte = manager.create(Compte, {
        idcompte: TEST_COMPTE_ID,
        idtype: 1, // Free account type from seed
        solde: '10000.00',
        numero_compte: '378548999999',
        idclient: TEST_CLIENT_ID,
        idag: 1,
      });
      await manager.save(compte);
    });
  });

  afterAll(async () => {
    if (dataSource) {
      await cleanDatabase(dataSource);
    }
    if (app) {
      await app.close();
    }
  });

  async function cleanDatabase(ds: DataSource) {
    await ds.transaction(async (manager) => {
      // Delete entities created during E2E testing
      await manager.delete(ClientNotification, { idclient: TEST_CLIENT_ID });
      await manager.delete(CoreTransaction, { idcompte: TEST_COMPTE_ID });
      await manager.delete(MavianceTransaction, { idcompte: TEST_COMPTE_ID });
      await manager.delete(Compte, { idcompte: TEST_COMPTE_ID });
      await manager.delete(Client, { idclient: TEST_CLIENT_ID });
    });
  }

  describe('JWT Protection Check', () => {
    it('should refuse request without authorization token', () => {
      return request(app.getHttpServer())
        .get('/api/maviance/services')
        .expect(401);
    });
  });

  describe('Maviance End-to-End Flow', () => {
    let quoteId: string;
    let localReference: string;

    it('1. GET /api/maviance/services -> should retrieve service list using mock client', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/maviance/services')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.message).toContain('Liste des services Maviance récupérée');
      expect(response.body.services).toBeInstanceOf(Array);
      expect(response.body.services[0].name).toBe('MTN MoMo E2E');
    });

    it('2. POST /api/maviance/quote -> should request a quote and insert local transaction in QUOTED state', async () => {
      const uniqueQuoteId = `Q-E2E-${Date.now()}`;
      testQuoteId = uniqueQuoteId; // Set the quoteId that our mock client router will return

      const response = await request(app.getHttpServer())
        .post('/api/maviance/quote')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          payItemId: 10023,
          amount: 1500,
          idcompte: TEST_COMPTE_ID,
          serviceNumber: '670000000',
        })
        .expect(201);

      expect(response.body.quote.quoteId).toBe(uniqueQuoteId);
      quoteId = uniqueQuoteId;

      // Verify the transaction was saved locally in QUOTED state
      const tx = await dataSource.getRepository(MavianceTransaction).findOne({
        where: { quoteId },
      });
      expect(tx).toBeDefined();
      expect(tx!.status).toBe('QUOTED');
      expect(Number(tx!.amount)).toBe(1500);
    });

    it('3. POST /api/maviance/collect -> should initiate payment collection and set status to PENDING', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/maviance/collect')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          quoteId: quoteId,
          idcompte: TEST_COMPTE_ID,
          customerPhonenumber: '670000000',
          customerEmailaddress: 'test@e2e.com',
          customerName: 'Test Customer',
          customerAddress: 'Douala',
        })
        .expect(201);

      expect(response.body.transaction.status).toBe('PENDING');
      expect(response.body.transaction.ptn).toBe('PTN-E2E-PENDING');

      localReference = response.body.transaction.reference;
      expect(localReference).toBeDefined();
    });

    it('4. POST /api/maviance/webhook -> should handle SUCCESS callback, credit the account and insert core transaction', async () => {
      const payload = {
        trid: localReference,
        ptn: 'PTN-E2E-SUCCESS',
        status: 'SUCCESS',
        amount: 1500,
        payItemId: 10023,
        timestamp: '2026-07-03T12:00:00Z',
      };

      const rawBody = JSON.stringify(payload);
      const secret = process.env.MAVIANCE_ACCESS_SECRET || '3ebe518d-4d0f-4346-ac37-fccac163227c';
      const signature = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');

      await request(app.getHttpServer())
        .post('/api/maviance/webhook')
        .set('x-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody)
        .expect(201);

      // Verify the local account was credited
      const compte = await dataSource.getRepository(Compte).findOne({
        where: { idcompte: TEST_COMPTE_ID },
      });
      expect(compte).toBeDefined();
      expect(parseFloat(compte!.solde)).toBe(11500.00); // 10000 + 1500

      // Verify the Maviance transaction is updated to SUCCESS
      const tx = await dataSource.getRepository(MavianceTransaction).findOne({
        where: { reference: localReference },
      });
      expect(tx!.status).toBe('SUCCESS');
      expect(tx!.ptn).toBe('PTN-E2E-SUCCESS');

      // Verify core transaction ledger entry is created
      const coreTx = await dataSource.getRepository(CoreTransaction).findOne({
        where: { references: localReference },
      });
      expect(coreTx).toBeDefined();
      expect(parseFloat(coreTx!.montant_transaction)).toBe(1500.00);
      expect(coreTx!.operateur).toBe('maviance');
    });

    it('5. POST /api/maviance/webhook (Security check in production) -> should reject callback with bad signature in production mode', async () => {
      // Mock production environment dynamically
      const originalEnv = process.env.MAVIANCE_ENV;
      process.env.MAVIANCE_ENV = 'production';

      const payload = {
        trid: localReference,
        ptn: 'PTN-E2E-INVALID',
        status: 'SUCCESS',
      };

      try {
        await request(app.getHttpServer())
          .post('/api/maviance/webhook')
          .set('x-signature', 'invalid_signature_hash')
          .send(payload)
          .expect(401);
      } finally {
        // Restore original env state
        process.env.MAVIANCE_ENV = originalEnv;
      }
    });

    it('6. POST /api/maviance/webhook (Security check in production) -> should reject callback with missing signature in production mode', async () => {
      const originalEnv = process.env.MAVIANCE_ENV;
      process.env.MAVIANCE_ENV = 'production';

      const payload = {
        trid: localReference,
        status: 'SUCCESS',
      };

      try {
        await request(app.getHttpServer())
          .post('/api/maviance/webhook')
          .send(payload)
          .expect(401);
      } finally {
        process.env.MAVIANCE_ENV = originalEnv;
      }
    });

    it('7. POST /api/maviance/transactions/:reference/verify -> should manually query status and return SUCCESS', async () => {
      // Create a pending transaction to verify
      const verifyRef = `MAV-VERIFY-${Date.now()}`;
      await dataSource.getRepository(MavianceTransaction).save({
        reference: verifyRef,
        quoteId: 'Q-VERIFY-1',
        payItemId: '10023',
        amount: 2000,
        status: 'PENDING',
        idcompte: TEST_COMPTE_ID,
        customerPhonenumber: '670000000',
        customerEmailaddress: 'test@e2e.com',
      });

      const response = await request(app.getHttpServer())
        .post(`/api/maviance/transactions/${verifyRef}/verify`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);

      expect(response.body.status).toBe('SUCCESS');
      expect(response.body.ptn).toBe('PTN-VERIFY-SUCCESS');

      // Verify the account was credited (previous 11500 + 2000 = 13500)
      const compte = await dataSource.getRepository(Compte).findOne({
        where: { idcompte: TEST_COMPTE_ID },
      });
      expect(parseFloat(compte!.solde)).toBe(13500.00);
    });
  });
});
