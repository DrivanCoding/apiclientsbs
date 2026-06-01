import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { Notification } from '../entities/notification.entity';
import { Setting } from '../entities/setting.entity';
import { Transaction } from '../entities/transaction.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { PaynoteModule } from '../paynote/paynote.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      Compte,
      Client,
      Notification,
      Setting,
      Typecompte,
    ]),
    PaynoteModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
