import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakePreouvertureIdentityOptional1788566400000 implements MigrationInterface {
  name = 'MakePreouvertureIdentityOptional1788566400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`sbs_preouverture_client_tampon\`
      MODIFY \`type_piece\` varchar(50) NULL,
      MODIFY \`num_piece_identite\` varchar(50) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE \`sbs_preouverture_client_tampon\`
      SET \`type_piece\` = 'CNI'
      WHERE \`type_piece\` IS NULL
    `);
    await queryRunner.query(`
      UPDATE \`sbs_preouverture_client_tampon\`
      SET \`num_piece_identite\` = CONCAT('TMP-', \`id\`)
      WHERE \`num_piece_identite\` IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`sbs_preouverture_client_tampon\`
      MODIFY \`type_piece\` varchar(50) NOT NULL,
      MODIFY \`num_piece_identite\` varchar(50) NOT NULL
    `);
  }
}
