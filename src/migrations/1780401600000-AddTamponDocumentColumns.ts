import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddTamponDocumentColumns1780401600000 implements MigrationInterface {
  name = 'AddTamponDocumentColumns1780401600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addColumnIfMissing(
      queryRunner,
      'sbs_preouverture_client_tampon',
      new TableColumn({
        name: 'numero_telephone',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'sbs_preouverture_client_tampon',
      new TableColumn({
        name: 'photo_piece_recto',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'sbs_preouverture_client_tampon',
      new TableColumn({
        name: 'photo_piece_verso',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'sbs_preouverture_client_tampon',
      new TableColumn({
        name: 'payment_json',
        type: 'longtext',
        isNullable: true,
      }),
    );

    await this.addColumnIfMissing(
      queryRunner,
      'sbs_ouverture_compte_tampon',
      new TableColumn({
        name: 'payment_json',
        type: 'longtext',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropColumnIfExists(
      queryRunner,
      'sbs_ouverture_compte_tampon',
      'payment_json',
    );
    await this.dropColumnIfExists(
      queryRunner,
      'sbs_preouverture_client_tampon',
      'payment_json',
    );
    await this.dropColumnIfExists(
      queryRunner,
      'sbs_preouverture_client_tampon',
      'photo_piece_verso',
    );
    await this.dropColumnIfExists(
      queryRunner,
      'sbs_preouverture_client_tampon',
      'photo_piece_recto',
    );
    await this.dropColumnIfExists(
      queryRunner,
      'sbs_preouverture_client_tampon',
      'numero_telephone',
    );
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    column: TableColumn,
  ): Promise<void> {
    const tableExists = await queryRunner.hasTable(tableName);
    if (!tableExists) {
      return;
    }

    const hasColumn = await queryRunner.hasColumn(tableName, column.name);
    if (!hasColumn) {
      await queryRunner.addColumn(tableName, column);
    }
  }

  private async dropColumnIfExists(
    queryRunner: QueryRunner,
    tableName: string,
    columnName: string,
  ): Promise<void> {
    const tableExists = await queryRunner.hasTable(tableName);
    if (!tableExists) {
      return;
    }

    const hasColumn = await queryRunner.hasColumn(tableName, columnName);
    if (hasColumn) {
      await queryRunner.dropColumn(tableName, columnName);
    }
  }
}
