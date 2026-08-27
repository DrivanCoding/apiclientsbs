import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { Notification } from '../entities/notification.entity';
import { OuvertureCompteTampon } from '../entities/ouverture-compte-tampon.entity';
import { PreouvertureClientTampon } from '../entities/preouverture-client-tampon.entity';
import { Setting } from '../entities/setting.entity';
import { Transaction } from '../entities/transaction.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { ListeOperator } from '../entities/liste-operator.entity';
import { PaynoteModule } from '../paynote/paynote.module';
import { MavianceModule } from '../maviance/maviance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaynoteWebhookController } from './paynote-webhook.controller';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Compte,
      Client,
      Notification,
      OuvertureCompteTampon,
      PreouvertureClientTampon,
      Setting,
      Typecompte,
      ListeOperator,
    ]),
    PaynoteModule,
    MavianceModule,
    NotificationsModule,
  ],
  controllers: [TransactionsController, PaynoteWebhookController],
  providers: [TransactionsService],
})
export class TransactionsModule { }
