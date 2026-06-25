import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class EnsureTamponTables1780405200000 implements MigrationInterface {
  name = 'EnsureTamponTables1780405200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`sbs_preouverture_client_tampon\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`nom\` varchar(100) NOT NULL,
        \`prenom\` varchar(50) DEFAULT NULL,
        \`email\` varchar(100) NOT NULL,
        \`telephone_principal\` varchar(20) NOT NULL,
        \`numero_telephone\` varchar(20) DEFAULT NULL,
        \`mot_de_passe\` varchar(255) NOT NULL,
        \`type_piece\` varchar(50) DEFAULT NULL,
        \`num_piece_identite\` varchar(50) DEFAULT NULL,
        \`adresse\` varchar(255) DEFAULT NULL,
        \`code_postal\` varchar(10) DEFAULT NULL,
        \`ville\` varchar(50) DEFAULT NULL,
        \`idag\` int NOT NULL,
        \`idtype\` int NOT NULL,
        \`montant_initial\` decimal(15,2) NOT NULL,
        \`frais_ouverture\` double NOT NULL DEFAULT 0,
        \`montant_minimum\` decimal(15,2) NOT NULL DEFAULT 0,
        \`operateur\` varchar(20) NOT NULL,
        \`references\` varchar(120) NOT NULL,
        \`description\` text DEFAULT NULL,
        \`photo_profil\` varchar(255) DEFAULT NULL,
        \`signature\` varchar(255) DEFAULT NULL,
        \`photo_cni\` varchar(255) DEFAULT NULL,
        \`photo_piece_recto\` varchar(255) DEFAULT NULL,
        \`photo_piece_verso\` varchar(255) DEFAULT NULL,
        \`payment_json\` longtext DEFAULT NULL,
        \`statut_validation\` varchar(30) NOT NULL DEFAULT 'pending_validation',
        \`message_validation\` text DEFAULT NULL,
        \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_preouv_status\` (\`statut_validation\`),
        KEY \`idx_preouv_agence\` (\`idag\`),
        KEY \`idx_preouv_type\` (\`idtype\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`sbs_ouverture_compte_tampon\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`idclient\` int NOT NULL,
        \`idtype\` int NOT NULL,
        \`idag\` int DEFAULT NULL,
        \`montant_initial\` decimal(15,2) NOT NULL,
        \`frais_ouverture\` double NOT NULL DEFAULT 0,
        \`montant_minimum\` decimal(15,2) NOT NULL DEFAULT 0,
        \`operateur\` varchar(20) NOT NULL,
        \`numero_telephone\` varchar(20) NOT NULL,
        \`references\` varchar(120) NOT NULL,
        \`description\` text DEFAULT NULL,
        \`payment_json\` longtext DEFAULT NULL,
        \`statut_validation\` varchar(30) NOT NULL DEFAULT 'pending_validation',
        \`message_validation\` text DEFAULT NULL,
        \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_ouv_status\` (\`statut_validation\`),
        KEY \`idx_ouv_client_type\` (\`idclient\`, \`idtype\`),
        KEY \`idx_ouv_agence\` (\`idag\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

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

  public async down(): Promise<void> {
    // Tables tampon are intentionally kept on revert to avoid losing pending mobile requests.
  }

  private async addColumnIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    column: TableColumn,
  ): Promise<void> {
    const hasColumn = await queryRunner.hasColumn(tableName, column.name);
    if (!hasColumn) {
      await queryRunner.addColumn(tableName, column);
    }
  }
}
