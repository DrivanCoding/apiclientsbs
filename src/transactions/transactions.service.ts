import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Compte } from '../entities/compte.entity';
import { Transaction } from '../entities/transaction.entity';
import { DepositDto } from './dto/deposit.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly repository: Repository<Transaction>,
    @InjectRepository(Compte)
    private readonly compteRepository: Repository<Compte>,
    private readonly dataSource: DataSource,
  ) {}

  create(payload: Partial<Transaction>) {
    return this.repository.save(payload);
  }

  findAll() {
    return this.repository.find();
  }

  findOne(id: number) {
    return this.repository.findOneBy({ idtransaction: id });
  }

  update(id: number, payload: Partial<Transaction>) {
    return this.repository.update(id, payload);
  }

  remove(id: number) {
    return this.repository.delete(id);
  }

  async deposit(dto: DepositDto) {
    return this.dataSource.transaction(async manager => {
      const compte = await manager.findOne(Compte, {
        where: { idcompte: dto.idcompte },
      });

      if (!compte || compte.idclient !== dto.idclient) {
        throw new NotFoundException('Compte introuvable');
      }

      const currentSolde = parseFloat(compte.solde ?? '0');
      const newSolde = currentSolde + dto.montant_transaction;

      const nextIdResult = await manager
        .createQueryBuilder(Transaction, 'transaction')
        .select('MAX(transaction.idtransaction)', 'max')
        .getRawOne<{ max: number }>();

      const nextId = (nextIdResult?.max ?? 0) + 1;

      const transaction = manager.create(Transaction, {
        idtransaction: nextId,
        iduser: 0,
        idcompte: compte.idcompte,
        montant_transaction: dto.montant_transaction.toFixed(2),
        type_transaction: 'versement',
        statut: 'complete',
        references: dto.references ?? `Collecte mobile ${dto.operateur}`,
        description:
          dto.description ??
          'Collecte mobile via ' + dto.operateur + ' sur ' + dto.numero_telephone,
      });

      const savedTransaction = await manager.save(transaction);

      compte.solde = newSolde.toFixed(2);
      await manager.save(compte);

      return savedTransaction;
    });
  }

  async findByClient(idclient: number) {
    return this.repository
      .createQueryBuilder('transaction')
      .innerJoin(Compte, 'compte', 'compte.idcompte = transaction.idcompte')
      .where('compte.idclient = :idclient', { idclient })
      .orderBy('transaction.date_transaction', 'DESC')
      .getMany();
  }
}
