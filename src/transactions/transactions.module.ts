import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Compte } from '../entities/compte.entity';
import { Transaction } from '../entities/transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Compte])],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
