import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MavianceTransaction } from '../entities/maviance-transaction.entity';
import { MavianceServiceCache } from '../entities/maviance-service-cache.entity';
import { MavianceController } from './maviance.controller';
import { MavianceWebhookController } from './maviance-webhook.controller';
import { MavianceAuthService } from './maviance-auth.service';
import { MavianceClient } from './maviance.client';
import { MaviancePaymentService } from './maviance-payment.service';
import { MavianceVerificationService } from './maviance-verification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([MavianceTransaction, MavianceServiceCache]),
  ],
  controllers: [
    MavianceController,
    MavianceWebhookController,
  ],
  providers: [
    MavianceAuthService,
    MavianceClient,
    MaviancePaymentService,
    MavianceVerificationService,
  ],
  exports: [
    MaviancePaymentService,
    MavianceVerificationService,
  ],
})
export class MavianceModule {}
