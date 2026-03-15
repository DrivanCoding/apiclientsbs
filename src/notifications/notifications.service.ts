import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repository: Repository<Notification>,
  ) {}

  findByClient(idclient: number) {
    return this.repository.find({
      where: { idclient },
      order: { date_creation: 'DESC' },
    });
  }
}
