import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeTransactionUserOptional1780700000000 implements MigrationInterface {
  name = 'MakeTransactionUserOptional1780700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      SET @constraint_exists = (
        SELECT COUNT(*)
        FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
          AND TABLE_NAME = 'transaction'
          AND CONSTRAINT_NAME = 'FK_TRANSACTION_USER'
      )
    `);
    await queryRunner.query(`
      SET @sql = IF(
        @constraint_exists > 0,
        'ALTER TABLE \`transaction\` DROP FOREIGN KEY \`FK_TRANSACTION_USER\`',
        'SELECT 1'
      )
    `);
    await queryRunner.query('PREPARE stmt FROM @sql');
    await queryRunner.query('EXECUTE stmt');
    await queryRunner.query('DEALLOCATE PREPARE stmt');
    await queryRunner.query('ALTER TABLE `transaction` MODIFY `iduser` int DEFAULT NULL');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('UPDATE `transaction` SET `iduser` = 1 WHERE `iduser` IS NULL');
    await queryRunner.query('ALTER TABLE `transaction` MODIFY `iduser` int NOT NULL');
    await queryRunner.query(`
      ALTER TABLE \`transaction\`
      ADD CONSTRAINT \`FK_TRANSACTION_USER\` FOREIGN KEY (\`iduser\`) REFERENCES \`user\` (\`iduser\`)
    `);
  }
}
