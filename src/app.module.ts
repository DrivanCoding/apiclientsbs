import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Agence } from './entities/agence.entity';
import { Client } from './entities/client.entity';
import { Compte } from './entities/compte.entity';
import { Transaction } from './entities/transaction.entity';
import { Typecompte } from './entities/typecompte.entity';
import { User } from './entities/user.entity';
import { AgencesModule } from './agences/agences.module';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { ComptesModule } from './comptes/comptes.module';
import { TransactionsModule } from './transactions/transactions.module';
import { TypecomptesModule } from './typecomptes/typecomptes.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      username: process.env.DB_USERNAME ?? 'root',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_DATABASE ?? 'clientsbs',
      entities: [Agence, Client, Compte, Transaction, Typecompte, User],
      synchronize: false,
    }),
    AuthModule,
    AgencesModule,
    ClientsModule,
    ComptesModule,
    TransactionsModule,
    TypecomptesModule,
    UsersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
