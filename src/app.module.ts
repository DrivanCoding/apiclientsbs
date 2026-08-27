import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Agence } from './entities/agence.entity';
import { AppEntity } from './entities/app.entity';
import { Client } from './entities/client.entity';
import { Compte } from './entities/compte.entity';
import { ComptePinOtp } from './entities/compte-pin-otp.entity';
import { ListeOperator } from './entities/liste-operator.entity';
import { Notification } from './entities/notification.entity';
import { OuvertureCompteTampon } from './entities/ouverture-compte-tampon.entity';
import { PreouvertureClientTampon } from './entities/preouverture-client-tampon.entity';
import { Setting } from './entities/setting.entity';
import { Transaction } from './entities/transaction.entity';
import { Typecompte } from './entities/typecompte.entity';
import { User } from './entities/user.entity';
import { Actualite } from './entities/actualite.entity';
import { AgencesModule } from './agences/agences.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ComptesModule } from './comptes/comptes.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TypecomptesModule } from './typecomptes/typecomptes.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ActualitesModule } from './actualites/actualites.module';
import { MavianceTransaction } from './entities/maviance-transaction.entity';
import { MavianceServiceCache } from './entities/maviance-service-cache.entity';
import { MavianceModule } from './maviance/maviance.module';
import { SmsModule } from './sms/sms.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      username: process.env.DB_USERNAME ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE ?? 'clientsbs',
      entities: [
        Agence,
        AppEntity,
        Client,
        Compte,
        ComptePinOtp,
        ListeOperator,
        Notification,
        OuvertureCompteTampon,
        PreouvertureClientTampon,
        Setting,
        Transaction,
        Typecompte,
        User,
        Actualite,
        MavianceTransaction,
        MavianceServiceCache,
      ],
      synchronize: false,
    }),
    AuthModule,
    AdminModule,
    AgencesModule,
    ClientsModule,
    ComptesModule,
    TransactionsModule,
    NotificationsModule,
    TypecomptesModule,
    UsersModule,
    ActualitesModule,
    MavianceModule,
    SmsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
