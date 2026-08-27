import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from 'typeorm';

export class SecurePaynoteTransactions1782700000000 implements MigrationInterface {
  name = 'SecurePaynoteTransactions1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(queryRunner, 'transaction');
    await this.addColumnIfMissing(queryRunner, 'sbs_ouverture_compte_tampon');
    await this.addColumnIfMissing(
      queryRunner,
      'sbs_preouverture_client_tampon',
    );

    await this.addUniqueIndexIfMissing(
      queryRunner,
      'transaction',
      'uq_transaction_references',
      ['references'],
    );
    await this.addUniqueIndexIfMissing(
      queryRunner,
      'transaction',
      'uq_transaction_provider_message_id',
      ['provider_message_id'],
    );
    await this.addUniqueIndexIfMissing(
      queryRunner,
      'sbs_ouverture_compte_tampon',
      'uq_ouverture_references',
      ['references'],
    );
    await this.addUniqueIndexIfMissing(
      queryRunner,
      'sbs_ouverture_compte_tampon',
      'uq_ouverture_provider_message_id',
      ['provider_message_id'],
    );
    await this.addUniqueIndexIfMissing(
      queryRunner,
      'sbs_preouverture_client_tampon',
      'uq_preouverture_references',
      ['references'],
    );
    await this.addUniqueIndexIfMissing(
      queryRunner,
      'sbs_preouverture_client_tampon',
      'uq_preouverture_provider_message_id',
      ['provider_message_id'],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, indexes] of [
      [
        'transaction',
        ['uq_transaction_references', 'uq_transaction_provider_message_id'],
      ],
      [
        'sbs_ouverture_compte_tampon',
        ['uq_ouverture_references', 'uq_ouverture_provider_message_id'],
      ],
      [
        'sbs_preouverture_client_tampon',
        ['uq_preouverture_references', 'uq_preouverture_provider_message_id'],
      ],
    ] as Array<[string, string[]]>) {
      const currentTable = await queryRunner.getTable(table);
      for (const indexName of indexes) {
        if (currentTable?.indices.some((index) => index.name === indexName)) {
          await queryRunner.dropIndex(table, indexName);
        }
      }
      if (await queryRunner.hasColumn(table, 'provider_message_id')) {
        await queryRunner.dropColumn(table, 'provider_message_id');
      }
    }
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
  ) {
    if (!(await queryRunner.hasColumn(tableName, 'provider_message_id'))) {
      await queryRunner.addColumn(
        tableName,
        new TableColumn({
          name: 'provider_message_id',
          type: 'varchar',
          length: '128',
          isNullable: true,
        }),
      );
    }
  }

  private async addUniqueIndexIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    indexName: string,
    columnNames: string[],
  ) {
    const table = await queryRunner.getTable(tableName);
    if (!table?.indices.some((index) => index.name === indexName)) {
      await queryRunner.createIndex(
        tableName,
        new TableIndex({ name: indexName, columnNames, isUnique: true }),
      );
    }
  }
}
