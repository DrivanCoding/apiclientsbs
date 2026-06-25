import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActualitesController } from './actualites.controller';
import { ActualitesService } from './actualites.service';
import { Actualite } from '../entities/actualite.entity';
import { Notification } from '../entities/notification.entity';
import { Client } from '../entities/client.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Actualite, Notification, Client]),
    NotificationsModule,
  ],
  controllers: [ActualitesController],
  providers: [ActualitesService],
  exports: [ActualitesService],
})
export class ActualitesModule {}
