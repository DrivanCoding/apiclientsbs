import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from '../entities/client.entity';
import { Compte } from '../entities/compte.entity';
import { ComptePinOtp } from '../entities/compte-pin-otp.entity';
import { Transaction } from '../entities/transaction.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { ComptesController } from './comptes.controller';
import { ComptesService } from './comptes.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Compte,
      Client,
      ComptePinOtp,
      Transaction,
      Typecompte,
    ]),
  ],
  controllers: [ComptesController],
  providers: [ComptesService],
})
export class ComptesModule {}
