import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Agence } from '../entities/agence.entity';
import { User } from '../entities/user.entity';
import { Compte } from '../entities/compte.entity';
import { Client } from '../entities/client.entity';
import { Typecompte } from '../entities/typecompte.entity';
import { Transaction } from '../entities/transaction.entity';
import { ListeOperator } from '../entities/liste-operator.entity';
import { Setting } from '../entities/setting.entity';
import { AppEntity } from '../entities/app.entity';
import { Notification } from '../entities/notification.entity';
import { OuvertureCompteTampon } from '../entities/ouverture-compte-tampon.entity';
import { PreouvertureClientTampon } from '../entities/preouverture-client-tampon.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Agence,
      User,
      Compte,
      Client,
      Typecompte,
      Transaction,
      ListeOperator,
      Setting,
      AppEntity,
      Notification,
      OuvertureCompteTampon,
      PreouvertureClientTampon,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
