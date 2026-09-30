import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTransactionCoreValidation1789776000000
  implements MigrationInterface
{
  name = 'AddTransactionCoreValidation1789776000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('transaction', 'statut_validation'))) {
      await queryRunner.addColumn(
        'transaction',
        new TableColumn({
          name: 'statut_validation',
          type: 'enum',
          enum: ['pending_validation', 'posted', 'rejected'],
          default: "'pending_validation'",
        }),
      );
      // Les versements crees depuis le Core sont deja comptabilises. Les
      // paiements Mobile Money existants restent a rapprocher avec les mappings
      // du Core afin de ne pas masquer une operation encore non comptabilisee.
      await queryRunner.query(
        "UPDATE `transaction` SET `statut_validation` = 'posted' WHERE `operateur` = 'sbscollecte'",
      );
    }
    if (!(await queryRunner.hasColumn('transaction', 'message_validation'))) {
      await queryRunner.addColumn(
        'transaction',
        new TableColumn({
          name: 'message_validation',
          type: 'text',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('transaction', 'date_validation'))) {
      await queryRunner.addColumn(
        'transaction',
        new TableColumn({
          name: 'date_validation',
          type: 'datetime',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const column of [
      'date_validation',
      'message_validation',
      'statut_validation',
    ]) {
      if (await queryRunner.hasColumn('transaction', column)) {
        await queryRunner.dropColumn('transaction', column);
      }
    }
  }
}
