import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';
import {
  NotificationPayload,
  NotificationsGateway,
} from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repository: Repository<Notification>,
    private readonly gateway: NotificationsGateway,
  ) {}

  findByClient(idclient: number) {
    return this.repository.find({
      where: { idclient },
      order: { date_creation: 'DESC' },
    });
  }

  async markAsRead(idclient: number, idnotification: number) {
    const notification = await this.repository.findOneBy({
      idclient,
      idnotification,
    });

    if (!notification) {
      throw new NotFoundException('Notification introuvable');
    }

    if (Number(notification.lu) !== 1) {
      await this.repository.update({ idclient, idnotification }, { lu: 1 });
    }

    return {
      success: true,
      idnotification,
      lu: 1,
    };
  }

  async markAllAsRead(idclient: number) {
    await this.repository.update({ idclient, lu: 0 }, { lu: 1 });
    return {
      success: true,
    };
  }

  async broadcast(payload: NotificationPayload) {
    this.gateway.emitNotification({
      titre: payload.titre,
      message: payload.message,
      type: payload.type ?? 'info',
      idclient: payload.idclient,
      date_creation: payload.date_creation ?? new Date(),
    });

    return {
      success: true,
    };
  }

  emitCreated(notification: Notification) {
    this.gateway.emitNotification(notification);
  }
}
