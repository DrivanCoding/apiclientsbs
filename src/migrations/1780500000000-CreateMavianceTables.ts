import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMavianceTables1780500000000 implements MigrationInterface {
  name = 'CreateMavianceTables1780500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create maviance_service_cache table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`maviance_service_cache\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`payItemId\` varchar(191) NOT NULL,
        \`serviceId\` int NOT NULL,
        \`name\` varchar(155) NOT NULL,
        \`category\` varchar(100) NOT NULL,
        \`merchant\` varchar(100) NOT NULL,
        \`rawPayload\` longtext NOT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_mav_service_payitem\` (\`payItemId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    // 2. Create maviance_transactions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`maviance_transactions\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`reference\` varchar(50) NOT NULL,
        \`ptn\` varchar(100) DEFAULT NULL,
        \`quoteId\` varchar(100) DEFAULT NULL,
        \`payItemId\` varchar(191) NOT NULL,
        \`amount\` decimal(15,2) NOT NULL,
        \`currency\` varchar(10) NOT NULL DEFAULT 'XAF',
        \`customerPhonenumber\` varchar(30) NOT NULL,
        \`customerEmailaddress\` varchar(150) NOT NULL,
        \`customerName\` varchar(150) DEFAULT NULL,
        \`customerAddress\` varchar(150) DEFAULT NULL,
        \`serviceNumber\` varchar(100) DEFAULT NULL,
        \`customerNumber\` varchar(100) DEFAULT NULL,
        \`status\` enum('INITIATED','QUOTED','PENDING','SUCCESS','FAILED','EXPIRED') NOT NULL DEFAULT 'INITIATED',
        \`errorCode\` varchar(20) DEFAULT NULL,
        \`errorMessage\` varchar(255) DEFAULT NULL,
        \`idcompte\` int NOT NULL,
        \`idclient\` int DEFAULT NULL,
        \`iduser\` int DEFAULT NULL,
        \`rawRequest\` longtext DEFAULT NULL,
        \`rawResponse\` longtext DEFAULT NULL,
        \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`idx_mav_tx_reference\` (\`reference\`),
        KEY \`idx_mav_tx_ptn\` (\`ptn\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.addConstraintIfMissing(
      queryRunner,
      'maviance_transactions',
      'fk_mav_tx_compte',
      'ADD CONSTRAINT `fk_mav_tx_compte` FOREIGN KEY (`idcompte`) REFERENCES `compte` (`idcompte`) ON DELETE CASCADE',
      'compte',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS `maviance_transactions`');
    await queryRunner.query('DROP TABLE IF EXISTS `maviance_service_cache`');
  }

  private async addConstraintIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    addConstraintSql: string,
    referencedTableName?: string,
  ) {
    const tableExists = await queryRunner.hasTable(tableName);
    if (!tableExists) {
      return;
    }

    if (referencedTableName) {
      const referencedTableExists = await queryRunner.hasTable(
        referencedTableName,
      );
      if (!referencedTableExists) {
        return;
      }
    }

    const rows = await queryRunner.query(
      `
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND CONSTRAINT_NAME = ?
      LIMIT 1
      `,
      [constraintName],
    );

    if (Array.isArray(rows) && rows.length > 0) {
      return;
    }

    await queryRunner.query(`ALTER TABLE \`${tableName}\` ${addConstraintSql}`);
  }
}
