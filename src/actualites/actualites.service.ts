import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Actualite } from '../entities/actualite.entity';
import { Notification } from '../entities/notification.entity';
import { Client } from '../entities/client.entity';

@Injectable()
export class ActualitesService {
  constructor(
    @InjectRepository(Actualite)
    private readonly actualiteRepository: Repository<Actualite>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(Client)
    private readonly clientRepository: Repository<Client>,
  ) {}

  async findAll(): Promise<Actualite[]> {
    return this.actualiteRepository.find({
      order: { date_creation: 'DESC' },
    });
  }

  async create(data: Partial<Actualite>): Promise<Actualite> {
    // 1. Enregistrer l'actualité
    const actualite = this.actualiteRepository.create(data);
    const savedActualite = await this.actualiteRepository.save(actualite);

    // 2. Récupérer tous les clients
    const clients = await this.clientRepository.find();

    // 3. Envoyer des notifications à tous les clients
    const notifications = clients.map((client) => {
      const notification = new Notification();
      notification.idclient = client.idclient;
      notification.titre = savedActualite.titre;
      notification.message = savedActualite.contenu;
      notification.type = 'actualite';
      notification.lu = 0;
      notification.date_creation = new Date();
      return notification;
    });

    if (notifications.length > 0) {
      await this.notificationRepository.save(notifications);
    }

    return savedActualite;
  }
}
