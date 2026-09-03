import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { Transaction } from '../entities/transaction.entity';
import { TransactionsService } from './transactions.service';

@Injectable()
export class PaynoteVerificationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PaynoteVerificationService.name);
  private isRunning = false;
  private isVerifying = false;
  private timeoutId?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Transaction)
    private readonly repository: Repository<Transaction>,
    private readonly transactionsService: TransactionsService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log('Paynote background verification service disabled.');
      return;
    }

    this.isRunning = true;
    this.logger.log('Paynote background verification service initialized.');
    this.startPollingLoop();
  }

  onModuleDestroy() {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
  }

  async verifyPendingTransactions(): Promise<void> {
    if (this.isVerifying) return;
    this.isVerifying = true;

    try {
      const windowHours = Math.max(
        1,
        Number(process.env.PAYNOTE_VERIFY_WINDOW_HOURS || 24),
      );
      const batchSize = Math.min(
        100,
        Math.max(1, Number(process.env.PAYNOTE_VERIFY_BATCH_SIZE || 20)),
      );
      const createdAfter = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      const pendingTransactions = await this.repository.find({
        where: {
          statut: 'en_attente',
          type_transaction: 'versement',
          provider_message_id: Not(IsNull()),
          date_transaction: MoreThanOrEqual(createdAfter),
        },
        order: { date_transaction: 'ASC' },
        take: batchSize,
      });

      for (const transaction of pendingTransactions) {
        const reference = transaction.references?.trim();
        const operator = String(transaction.operateur || '').toLowerCase();
        const isPaynoteOperator =
          operator.includes('mtn') ||
          operator.includes('momo') ||
          operator.includes('orange') ||
          operator === 'om';

        if (!reference || !isPaynoteOperator) continue;

        try {
          const result =
            await this.transactionsService.recheckTransactionStatus(reference);
          if (result.status !== 'pending') {
            this.logger.log(
              `Transaction Paynote ${reference} reconcilee: ${result.status}.`,
            );
          }
        } catch (error) {
          this.logger.warn(
            `Verification Paynote impossible pour ${reference}: ${(error as Error)?.message || error}`,
          );
        }
      }
    } finally {
      this.isVerifying = false;
    }
  }

  private startPollingLoop() {
    const intervalSeconds = Math.max(
      5,
      Number(process.env.PAYNOTE_VERIFY_INTERVAL_SECONDS || 15),
    );

    const poll = async () => {
      if (!this.isRunning) return;

      try {
        await this.verifyPendingTransactions();
      } catch (error) {
        this.logger.error(
          `Echec de la reconciliation Paynote: ${(error as Error)?.message || error}`,
        );
      }

      if (this.isRunning) {
        this.timeoutId = setTimeout(poll, intervalSeconds * 1000);
      }
    };

    this.timeoutId = setTimeout(poll, 0);
  }

  private isEnabled() {
    const configured = String(
      process.env.PAYNOTE_BACKGROUND_VERIFY_ENABLED || '',
    )
      .trim()
      .toLowerCase();
    if (configured) return configured === 'true';

    return (
      String(process.env.MYAPIOPERATOR || '')
        .trim()
        .toLowerCase() === 'paynote'
    );
  }
}
