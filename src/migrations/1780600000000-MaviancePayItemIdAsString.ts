import { MigrationInterface, QueryRunner } from 'typeorm';

export class MaviancePayItemIdAsString1780600000000
  implements MigrationInterface
{
  name = 'MaviancePayItemIdAsString1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.modifyColumnIfExists(
      queryRunner,
      'maviance_service_cache',
      '`payItemId` varchar(191) NOT NULL',
    );

    await this.modifyColumnIfExists(
      queryRunner,
      'maviance_transactions',
      '`payItemId` varchar(191) NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.modifyColumnIfExists(
      queryRunner,
      'maviance_service_cache',
      '`payItemId` int NOT NULL',
    );

    await this.modifyColumnIfExists(
      queryRunner,
      'maviance_transactions',
      '`payItemId` int NOT NULL',
    );
  }

  private async modifyColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnDefinition: string,
  ) {
    const tableExists = await queryRunner.hasTable(tableName);
    if (!tableExists) {
      return;
    }

    const hasColumn = await queryRunner.hasColumn(tableName, 'payItemId');
    if (!hasColumn) {
      return;
    }

    await queryRunner.query(
      `ALTER TABLE \`${tableName}\` MODIFY ${columnDefinition}`,
    );
  }
}
