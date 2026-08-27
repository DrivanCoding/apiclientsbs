import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePreouverturePasswordOptional1787788801000 implements MigrationInterface {
  name = 'MakePreouverturePasswordOptional1787788801000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`sbs_preouverture_client_tampon\`
      MODIFY \`mot_de_passe\` varchar(255) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`sbs_preouverture_client_tampon\`
      SET \`mot_de_passe\` = ''
      WHERE \`mot_de_passe\` IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`sbs_preouverture_client_tampon\`
      MODIFY \`mot_de_passe\` varchar(255) NOT NULL
    `);
  }
}
