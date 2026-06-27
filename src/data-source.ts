import './env';
import { DataSource } from 'typeorm';
import { Actualite } from './entities/actualite.entity';
import { Agence } from './entities/agence.entity';
import { AppEntity } from './entities/app.entity';
import { Client } from './entities/client.entity';
import { ComptePinOtp } from './entities/compte-pin-otp.entity';
import { Compte } from './entities/compte.entity';
import { ListeOperator } from './entities/liste-operator.entity';
import { Notification } from './entities/notification.entity';
import { Setting } from './entities/setting.entity';
import { Transaction } from './entities/transaction.entity';
import { Typecompte } from './entities/typecompte.entity';
import { User } from './entities/user.entity';
import { MavianceTransaction } from './entities/maviance-transaction.entity';
import { MavianceServiceCache } from './entities/maviance-service-cache.entity';

export default new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USERNAME ?? 'root',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'clientsbs',
  entities: [
    Actualite,
    Agence,
    AppEntity,
    Client,
    ComptePinOtp,
    Compte,
    ListeOperator,
    Notification,
    Setting,
    Transaction,
    Typecompte,
    User,
    MavianceTransaction,
    MavianceServiceCache,
  ],
  migrations: ['dist/migrations/*.js'],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});
