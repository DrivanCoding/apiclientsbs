import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePreouvertureEmailOptional1787788800000 implements MigrationInterface {
  name = 'MakePreouvertureEmailOptional1787788800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`sbs_preouverture_client_tampon\`
      MODIFY \`email\` varchar(100) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`sbs_preouverture_client_tampon\`
      SET \`email\` = ''
      WHERE \`email\` IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`sbs_preouverture_client_tampon\`
      MODIFY \`email\` varchar(100) NOT NULL
    `);
  }
}
