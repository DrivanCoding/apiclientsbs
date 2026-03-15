import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Agence } from './entities/agence.entity';
import { Client } from './entities/client.entity';
import { Compte } from './entities/compte.entity';
import { ListeOperator } from './entities/liste-operator.entity';
import { Notification } from './entities/notification.entity';
import { Setting } from './entities/setting.entity';
import { Transaction } from './entities/transaction.entity';
import { Typecompte } from './entities/typecompte.entity';
import { User } from './entities/user.entity';
import { AgencesModule } from './agences/agences.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ComptesModule } from './comptes/comptes.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TypecomptesModule } from './typecomptes/typecomptes.module';
import { UsersModule } from './users/users.module';
import { NotificationsModule } from './notifications/notifications.module';

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
        Client,
        Compte,
        ListeOperator,
        Notification,
        Setting,
        Transaction,
        Typecompte,
        User,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
