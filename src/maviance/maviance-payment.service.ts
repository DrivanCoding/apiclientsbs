import { Injectable, NotFoundException, BadRequestException, BadGatewayException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { MavianceTransaction } from '../entities/maviance-transaction.entity';
import { MavianceServiceCache } from '../entities/maviance-service-cache.entity';
import { Compte } from '../entities/compte.entity';
import { Transaction as CoreTransaction } from '../entities/transaction.entity';
import { Notification as ClientNotification } from '../entities/notification.entity';
import { MavianceClient } from './maviance.client';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { CollectRequestDto } from './dto/collect-request.dto';
import { MavianceErrorMapper } from './maviance-error.mapper';

@Injectable()
export class MaviancePaymentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly client: MavianceClient,
    @InjectRepository(MavianceTransaction)
    private readonly txRepository: Repository<MavianceTransaction>,
    @InjectRepository(MavianceServiceCache)
    private readonly cacheRepository: Repository<MavianceServiceCache>,
  ) {}

  /**
   * Retrieves all active payment services, using cached data if possible.
   */
  async getServices(): Promise<any[]> {
    const ttlSeconds = Number(process.env.MAVIANCE_MASTER_DATA_CACHE_TTL || 86400);
    const ttlMs = ttlSeconds * 1000;

    // Check cache
    const newestCache = await this.cacheRepository.findOne({
      where: {},
      order: { updatedAt: 'DESC' },
    });

    if (newestCache && Date.now() - newestCache.updatedAt.getTime() < ttlMs) {
      const allCached = await this.cacheRepository.find();
      return allCached.map((c) => JSON.parse(c.rawPayload));
    }

    // Cache missing or expired, fetch fresh services from Maviance
    try {
      const services = await this.client.request<any[]>('GET', '/service');
      
      // Clear old cache and insert fresh services
      await this.dataSource.transaction(async (manager) => {
        await manager.clear(MavianceServiceCache);
        for (const svc of services) {
          const cacheEntry = manager.create(MavianceServiceCache, {
            payItemId: String(svc.payItemId || ''),
            serviceId: Number(svc.serviceId || svc.serviceid || 0),
            name: String(svc.name || ''),
            category: String(svc.category || ''),
            merchant: String(svc.merchant || ''),
            rawPayload: JSON.stringify(svc),
          });
          await manager.save(cacheEntry);
        }
      });

      return services;
    } catch (error) {
      // Fallback to cache if Maviance API is down, to ensure resilience
      const allCached = await this.cacheRepository.find();
      if (allCached.length > 0) {
        return allCached.map((c) => JSON.parse(c.rawPayload));
      }
      throw error;
    }
  }

  /**
   * Initiates a quote request and records it locally.
   */
  async requestQuote(dto: QuoteRequestDto, idcompte: number, idclient?: number, iduser?: number): Promise<any> {
    const quotePayload: Record<string, any> = {
      payItemId: dto.payItemId,
      amount: dto.amount,
    };
    if (dto.serviceNumber) quotePayload['serviceNumber'] = dto.serviceNumber;
    if (dto.customerNumber) quotePayload['customerNumber'] = dto.customerNumber;

    const maskedRequest = this.maskSensitiveFields(quotePayload);

    try {
      const response = await this.client.request<any>('POST', '/quotestd', quotePayload);
      const maskedResponse = this.maskSensitiveFields(response);

      // Create local transaction in QUOTED state
      const quoteId = response.quoteId || `Q-${Date.now()}`;
      
      const transaction = this.txRepository.create({
        reference: `MAV-TEMP-${Date.now()}`,
        quoteId,
        payItemId: dto.payItemId,
        amount: dto.amount,
        customerPhonenumber: dto.serviceNumber || '', // Temporary mapping
        customerEmailaddress: '',
        status: 'QUOTED',
        idcompte,
        idclient,
        iduser,
        rawRequest: maskedRequest,
        rawResponse: maskedResponse,
      });

      await this.txRepository.save(transaction);
      return response;
    } catch (error: any) {
      throw new BadGatewayException({
        message: `Échec de la demande de quote: ${error.message}`,
        error: error.raw || error,
      });
    }
  }

  /**
   * Finalizes a payment collection by submitting it to Maviance.
   */
  async collect(dto: CollectRequestDto, userId?: number, clientId?: number): Promise<MavianceTransaction> {
    const reference = `MAV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    // Try to find the transaction initiated during the quote phase
    let transaction = await this.txRepository.findOne({
      where: { quoteId: dto.quoteId },
    });

    if (transaction) {
      // Update the transaction details
      transaction.reference = reference;
      transaction.customerPhonenumber = dto.customerPhonenumber;
      transaction.customerEmailaddress = dto.customerEmailaddress;
      transaction.customerName = dto.customerName;
      transaction.customerAddress = dto.customerAddress;
      transaction.serviceNumber = dto.serviceNumber;
      transaction.customerNumber = dto.customerNumber;
      transaction.status = 'PENDING';
      transaction.idcompte = dto.idcompte;
      transaction.idclient = clientId;
      transaction.iduser = userId;
    } else {
      // Create new transaction if quote was not recorded locally
      transaction = this.txRepository.create({
        reference,
        quoteId: dto.quoteId,
        payItemId: '', // Will be updated from response or quote if available
        amount: 0, // Will be updated from response or defaults
        customerPhonenumber: dto.customerPhonenumber,
        customerEmailaddress: dto.customerEmailaddress,
        customerName: dto.customerName,
        customerAddress: dto.customerAddress,
        serviceNumber: dto.serviceNumber,
        customerNumber: dto.customerNumber,
        status: 'PENDING',
        idcompte: dto.idcompte,
        idclient: clientId,
        iduser: userId,
      });
    }

    const collectPayload: Record<string, any> = {
      quoteId: dto.quoteId,
      customerPhonenumber: dto.customerPhonenumber,
      customerEmailaddress: dto.customerEmailaddress,
      trid: reference,
    };
    if (dto.customerName) collectPayload['customerName'] = dto.customerName;
    if (dto.customerAddress) collectPayload['customerAddress'] = dto.customerAddress;
    if (dto.serviceNumber) collectPayload['serviceNumber'] = dto.serviceNumber;
    if (dto.customerNumber) collectPayload['customerNumber'] = dto.customerNumber;

    transaction.rawRequest = this.maskSensitiveFields(collectPayload);
    await this.txRepository.save(transaction);

    try {
      const response = await this.client.request<any>('POST', '/collectstd', collectPayload);
      transaction.rawResponse = this.maskSensitiveFields(response);
      transaction.ptn = response.ptn;

      if (response.amount) {
        transaction.amount = Number(response.amount);
      }
      if (response.payItemId) {
        transaction.payItemId = String(response.payItemId);
      }

      const status = String(response.status || '').toUpperCase();
      if (status === 'SUCCESS' || status === 'SUCCESSFUL') {
        // Complete the transaction and credit bank account
        return await this.dataSource.transaction(async (manager) => {
          return this.completeTransactionInternal(transaction.reference, response.ptn, manager);
        });
      } else if (status === 'FAILED' || status === 'ERRORED') {
        const errorCode = response.errorCode || 'UNKNOWN';
        const errorMessage = response.errorMessage || 'Échec de la transaction';
        return await this.failTransactionInternal(transaction.reference, errorCode, errorMessage);
      } else {
        // Status is PENDING
        transaction.status = 'PENDING';
        return await this.txRepository.save(transaction);
      }
    } catch (error: any) {
      // Map API failure
      let errorCode = 'CONNECTION_ERROR';
      let errorMessage = error.message;

      if (error.getResponse && typeof error.getResponse === 'function') {
        const response = error.getResponse();
        if (typeof response === 'object' && response !== null) {
          const resObj = response as any;
          const raw = resObj.raw || {};
          errorCode = resObj.code || raw.errorCode || raw.code || errorCode;
          errorMessage = raw.errorMessage || raw.message || resObj.message || errorMessage;
        }
      } else {
        const raw = error.raw || {};
        errorCode = error.code || raw.errorCode || raw.code || errorCode;
        errorMessage = raw.errorMessage || raw.message || error.message || errorMessage;
      }

      transaction.status = 'FAILED';
      transaction.errorCode = String(errorCode);
      transaction.errorMessage = MavianceErrorMapper.mapCode(errorCode, errorMessage);
      await this.txRepository.save(transaction);

      throw new BadRequestException(transaction.errorMessage);
    }
  }

  /**
   * Processes an incoming webhook callback from Maviance.
   */
  async handleWebhook(payload: any): Promise<void> {
    const reference = payload.trid;
    const ptn = payload.ptn;
    if (!reference) {
      throw new BadRequestException('Le paramètre trid est obligatoire dans le callback webhook.');
    }

    const status = String(payload.status || '').toUpperCase();

    await this.dataSource.transaction(async (manager) => {
      // Acquire pessimistic write lock to handle concurrency safely (Finding 1)
      const transaction = await manager.findOne(MavianceTransaction, {
        where: [{ reference }, { ptn }],
        lock: { mode: 'pessimistic_write' },
      });

      if (!transaction) {
        throw new NotFoundException(`Transaction local introuvable pour la référence ${reference}`);
      }

      // Check for idempotency: do not re-process final states
      if (transaction.status === 'SUCCESS' || transaction.status === 'FAILED' || transaction.status === 'EXPIRED') {
        return;
      }

      transaction.rawResponse = this.maskSensitiveFields(payload);

      if (status === 'SUCCESS' || status === 'SUCCESSFUL') {
        await this.completeTransactionInternal(transaction.reference, ptn, manager);
      } else if (status === 'FAILED' || status === 'ERRORED') {
        const errorCode = payload.errorCode || 'UNKNOWN';
        const errorMessage = payload.errorMessage || 'Échec via webhook';
        await this.failTransactionInternal(transaction.reference, errorCode, errorMessage, manager);
      }
    });
  }

  /**
   * Credits the bank account and flags the transaction as SUCCESS.
   * Internal method running within database transaction manager.
   */
  async completeTransactionInternal(
    reference: string,
    ptn: string,
    manager: EntityManager,
  ): Promise<MavianceTransaction> {
    const transaction = await manager.findOne(MavianceTransaction, {
      where: { reference },
      lock: { mode: 'pessimistic_write' }, // Pessimistic lock (Finding 1)
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${reference} introuvable.`);
    }

    if (transaction.status === 'SUCCESS') {
      return transaction;
    }

    const compte = await manager.findOne(Compte, {
      where: { idcompte: transaction.idcompte },
      lock: { mode: 'pessimistic_write' },
    });

    if (!compte) {
      throw new NotFoundException(`Compte bancaire ${transaction.idcompte} introuvable.`);
    }

    // Apply the account credit
    const currentSolde = parseFloat(compte.solde || '0');
    const newSolde = currentSolde + Number(transaction.amount);
    compte.solde = newSolde.toFixed(2);
    await manager.save(compte);

    // Create record in the core transaction ledger
    const coreTx = manager.create(CoreTransaction, {
      iduser: transaction.iduser,
      idcompte: compte.idcompte,
      montant_transaction: Number(transaction.amount).toFixed(2),
      type_transaction: 'versement',
      operateur: 'maviance',
      statut: 'complete',
      references: transaction.reference,
      description: `Collecte Maviance / Smobilpay (PTN: ${ptn || transaction.ptn})`,
    });
    await manager.save(coreTx);

    // Create client notification
    const notification = manager.create(ClientNotification, {
      idclient: transaction.idclient || compte.idclient || 0,
      titre: 'Versement réussi (Maviance)',
      message: `Votre compte ${compte.numero_compte} a été crédité de ${Number(transaction.amount).toFixed(2)} XAF via Smobilpay.`,
      type: 'versement',
      lu: 0,
    });
    await manager.save(notification);

    // Update Maviance transaction state
    transaction.status = 'SUCCESS';
    transaction.ptn = ptn || transaction.ptn;
    transaction.errorCode = undefined;
    transaction.errorMessage = undefined;

    return await manager.save(transaction);
  }

  /**
   * Flags the transaction as FAILED.
   */
  async failTransactionInternal(
    reference: string,
    errorCode: string,
    errorMessage: string,
    em?: EntityManager,
  ): Promise<MavianceTransaction> {
    const manager = em || this.dataSource.manager;
    const transaction = await manager.findOne(MavianceTransaction, {
      where: { reference },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction ${reference} introuvable.`);
    }

    if (transaction.status === 'FAILED' || transaction.status === 'SUCCESS') {
      return transaction;
    }

    transaction.status = 'FAILED';
    transaction.errorCode = String(errorCode);
    transaction.errorMessage = MavianceErrorMapper.mapCode(errorCode, errorMessage);

    return await manager.save(transaction);
  }

  /**
   * Utility to mask sensitive fields in JSON request/response payloads to protect user privacy (Finding 3).
   */
  private maskSensitiveFields(payload: any): string {
    if (!payload) return '';
    try {
      const data = JSON.parse(JSON.stringify(payload));
      const sensitiveKeys = [
        'customerPhonenumber',
        'customerEmailaddress',
        'customerName',
        'customerAddress',
        'pin',
        'customerNumber',
        'serviceNumber',
      ];
      for (const key of sensitiveKeys) {
        if (data[key] !== undefined && data[key] !== null) {
          data[key] = '*****';
        }
      }
      return JSON.stringify(data);
    } catch (e) {
      return String(payload);
    }
  }
}
