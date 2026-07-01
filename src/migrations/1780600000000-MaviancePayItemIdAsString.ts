import { MigrationInterface, QueryRunner } from 'typeorm';

export class MaviancePayItemIdAsString1780600000000
  implements MigrationInterface
{
  name = 'MaviancePayItemIdAsString1780600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`maviance_service_cache\`
      MODIFY \`payItemId\` varchar(191) NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`maviance_transactions\`
      MODIFY \`payItemId\` varchar(191) NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`maviance_service_cache\`
      MODIFY \`payItemId\` int NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE \`maviance_transactions\`
      MODIFY \`payItemId\` int NOT NULL
    `);
  }
}
