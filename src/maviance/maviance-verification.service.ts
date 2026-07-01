import { Injectable, OnModuleInit, OnModuleDestroy, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { MavianceTransaction } from '../entities/maviance-transaction.entity';
import { MavianceClient } from './maviance.client';
import { MaviancePaymentService } from './maviance-payment.service';

@Injectable()
export class MavianceVerificationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MavianceVerificationService.name);
  private isRunning = false;
  private timeoutId?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    private readonly client: MavianceClient,
    private readonly paymentService: MaviancePaymentService,
    @InjectRepository(MavianceTransaction)
    private readonly txRepository: Repository<MavianceTransaction>,
  ) {}

  onModuleInit() {
    const enabled =
      String(process.env.MAVIANCE_BACKGROUND_VERIFY_ENABLED || 'false')
        .trim()
        .toLowerCase() === 'true';
    if (!enabled) {
      this.logger.log('Maviance background verification service disabled.');
      return;
    }

    this.isRunning = true;
    this.logger.log('Maviance background verification service initialized.');
    this.startPollingLoop();
  }

  onModuleDestroy() {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.logger.log('Maviance background verification service stopped.');
  }

  private startPollingLoop() {
    const intervalSeconds = Number(process.env.MAVIANCE_VERIFY_INTERVAL_SECONDS || 10);
    const intervalMs = Math.max(2000, intervalSeconds * 1000); // Minimum 2 seconds to avoid CPU spin

    const poll = async () => {
      if (!this.isRunning) return;
      try {
        await this.verifyPendingTransactions();
      } catch (error: any) {
        this.logger.error(`Error during background verification poll: ${error.message || error}`);
      }

      if (this.isRunning) {
        this.timeoutId = setTimeout(poll, intervalMs);
      }
    };

    this.timeoutId = setTimeout(poll, intervalMs);
  }

  /**
   * Scans and verifies all transactions stuck in PENDING status.
   * Restricts scan to the last 2 hours to avoid excessive API requests (Finding 5).
   */
  async verifyPendingTransactions(): Promise<void> {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const pendingTxList = await this.txRepository.find({
      where: {
        status: 'PENDING',
        createdAt: MoreThanOrEqual(twoHoursAgo),
      },
      order: { updatedAt: 'ASC' },
      take: 10, // Process in batches of 10 to protect resources
    });

    if (pendingTxList.length === 0) {
      return;
    }

    this.logger.log(`Verifying ${pendingTxList.length} pending Maviance transactions...`);

    for (const tx of pendingTxList) {
      try {
        await this.verifyTransaction(tx);
      } catch (err: any) {
        this.logger.error(`Failed to verify pending transaction ${tx.reference}: ${err.message || err}`);
      }
    }
  }

  /**
   * Manually triggers verification for a specific transaction by its reference.
   * Accessible via API endpoint.
   */
  async manualVerify(reference: string): Promise<MavianceTransaction> {
    const tx = await this.txRepository.findOne({
      where: { reference },
    });

    if (!tx) {
      throw new NotFoundException(`Transaction Maviance avec la référence ${reference} introuvable.`);
    }

    if (tx.status === 'SUCCESS' || tx.status === 'FAILED') {
      return tx;
    }

    return await this.verifyTransaction(tx);
  }

  /**
   * Helper that executes the /verifytx query, processes final state updates,
   * and handles bank account credits if needed.
   */
  private async verifyTransaction(tx: MavianceTransaction): Promise<MavianceTransaction> {
    const verifyParams: Record<string, string> = {};
    if (tx.ptn) {
      verifyParams['ptn'] = tx.ptn;
    } else {
      verifyParams['trid'] = tx.reference;
    }

    try {
      const response = await this.client.request<any>('GET', '/verifytx', verifyParams);
      const status = String(response.status || response.txStatus || '').toUpperCase();
      const ptn = response.ptn || tx.ptn;

      if (status === 'SUCCESS' || status === 'SUCCESSFUL') {
        // Success terminal state: credit target account
        return await this.dataSource.transaction(async (manager) => {
          return await this.paymentService.completeTransactionInternal(tx.reference, ptn, manager);
        });
      } else if (status === 'FAILED' || status === 'ERRORED') {
        // Failure terminal state
        const errorCode = response.errorCode || 'UNKNOWN';
        const errorMessage = response.errorMessage || 'Échec lors de la vérification';
        return await this.paymentService.failTransactionInternal(tx.reference, errorCode, errorMessage);
      } else {
        // Transaction is still pending
        tx.updatedAt = new Date();
        return await this.txRepository.save(tx);
      }
    } catch (error: any) {
      this.logger.warn(`API call /verifytx failed for ${tx.reference}: ${error.message || error}`);
      throw error;
    }
  }
}
