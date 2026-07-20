import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSbsClientSchema1780315200000 implements MigrationInterface {
  name = 'CreateSbsClientSchema1780315200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`agence\` (
        \`idag\` int NOT NULL AUTO_INCREMENT,
        \`idcompagnie\` int NOT NULL,
        \`nom_agence\` varchar(100) NOT NULL,
        \`alias_agence\` varchar(10) DEFAULT NULL,
        \`ville\` varchar(50) DEFAULT NULL,
        \`telephone_agence\` varchar(20) DEFAULT NULL,
        \`date_ouverture\` date DEFAULT NULL,
        \`statut_agence\` enum('actif','hors_service') DEFAULT 'actif',
        PRIMARY KEY (\`idag\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`clients\` (
        \`idclient\` int NOT NULL AUTO_INCREMENT,
        \`code_client\` varchar(20) NOT NULL,
        \`civilite\` enum('M','Mme','Mlle','Dr','Pr') DEFAULT NULL,
        \`nom\` varchar(100) NOT NULL,
        \`prenom\` varchar(50) DEFAULT NULL,
        \`date_naissance\` date DEFAULT NULL,
        \`lieu_naissance\` varchar(100) DEFAULT NULL,
        \`nom_entreprise\` varchar(100) DEFAULT NULL,
        \`nationalite\` varchar(50) DEFAULT NULL,
        \`piece_identite\` varchar(50) NOT NULL,
        \`num_piece_identite\` varchar(50) NOT NULL,
        \`date_expiration_piece\` date DEFAULT NULL,
        \`adresse\` varchar(255) NOT NULL,
        \`complement_adresse\` varchar(100) DEFAULT NULL,
        \`code_postal\` varchar(10) NOT NULL,
        \`ville\` varchar(50) NOT NULL,
        \`pays\` varchar(50) DEFAULT 'France',
        \`telephone_principal\` varchar(20) DEFAULT NULL,
        \`telephone_secondaire\` varchar(20) DEFAULT NULL,
        \`email\` varchar(100) DEFAULT NULL,
        \`mot_de_passe\` varchar(255) DEFAULT NULL,
        \`profession\` varchar(100) DEFAULT NULL,
        \`situation_familiale\` enum('celibataire','marie','divorce','veuf','concubinage','pacse') DEFAULT NULL,
        \`nombre_enfants\` int DEFAULT 0,
        \`date_inscription\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`date_derniere_modif\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        \`statut\` enum('actif','inactif','suspendu','decede') DEFAULT 'actif',
        \`notation_risque\` enum('faible','moyen','eleve') DEFAULT 'faible',
        \`commentaires\` text,
        \`photo_identite\` varchar(255) DEFAULT NULL,
        \`signature\` varchar(255) DEFAULT NULL,
        \`idag\` int DEFAULT NULL,
        \`idzone\` int DEFAULT NULL,
        \`is_first_login\` int NOT NULL DEFAULT 1,
        PRIMARY KEY (\`idclient\`),
        UNIQUE KEY \`code_client\` (\`code_client\`),
        KEY \`idx_client_agence\` (\`idag\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`app\` (
        \`idapp\` int NOT NULL AUTO_INCREMENT,
        \`nom_app\` varchar(100) NOT NULL,
        \`api_key\` varchar(255) NOT NULL,
        \`secret_key\` varchar(255) NOT NULL,
        \`date_creation\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`date_modification\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`idapp\`),
        UNIQUE KEY \`api_key\` (\`api_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`typecompte\` (
        \`idtype\` int NOT NULL AUTO_INCREMENT,
        \`libelle\` varchar(50) NOT NULL,
        \`description\` text,
        \`taux_interet\` decimal(5,2) DEFAULT 0.00,
        \`frais_tenue_compte\` decimal(10,2) DEFAULT 0.00,
        \`plafond\` decimal(15,2) DEFAULT NULL,
        \`frais_ouverture\` double DEFAULT NULL,
        \`frais_retrait\` double DEFAULT NULL,
        \`code_type\` varchar(3) DEFAULT NULL,
        \`idcategorie\` int NOT NULL DEFAULT 1,
        \`numero\` int NOT NULL DEFAULT 1,
        \`type\` enum('1','2','3') NOT NULL DEFAULT '1',
        \`idparent\` int DEFAULT NULL,
        \`mobile_sync_enabled\` int NOT NULL DEFAULT 0,
        \`mobile_can_open\` int NOT NULL DEFAULT 0,
        \`mobile_can_view\` int NOT NULL DEFAULT 1,
        \`mobile_can_deposit\` int NOT NULL DEFAULT 1,
        PRIMARY KEY (\`idtype\`),
        KEY \`idx_typecompte_parent\` (\`idparent\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`compte\` (
        \`idcompte\` int NOT NULL AUTO_INCREMENT,
        \`idtype\` int NOT NULL,
        \`solde\` decimal(15,2) NOT NULL DEFAULT 0.00,
        \`date_ouverture\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`date_derniere_operation\` datetime DEFAULT NULL,
        \`statut\` enum('actif','inactif','bloque') DEFAULT 'actif',
        \`idclient\` int DEFAULT NULL,
        \`numero_compte\` varchar(55) NOT NULL,
        \`pin_code\` varchar(255) DEFAULT NULL,
        \`idzone\` int DEFAULT NULL,
        \`idguichet\` int DEFAULT NULL,
        \`idinst\` int DEFAULT NULL,
        \`idag\` int DEFAULT NULL,
        PRIMARY KEY (\`idcompte\`),
        UNIQUE KEY \`numero_compte\` (\`numero_compte\`),
        KEY \`FK_COMPTE_TYPECOMPTE\` (\`idtype\`),
        KEY \`clientcompte\` (\`idclient\`),
        KEY \`fk_agencecompte\` (\`idag\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`user\` (
        \`iduser\` int NOT NULL AUTO_INCREMENT,
        \`idag\` int NOT NULL,
        \`nom\` varchar(50) NOT NULL,
        \`prenom\` varchar(50) NOT NULL,
        \`email\` varchar(100) DEFAULT NULL,
        \`telephone\` varchar(20) DEFAULT NULL,
        \`login\` varchar(50) DEFAULT NULL,
        \`password\` varchar(255) NOT NULL,
        \`adresse\` varchar(255) DEFAULT NULL,
        \`date_naissance\` date DEFAULT NULL,
        \`date_inscription\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`statut\` enum('actif','inactif','bloque') DEFAULT 'actif',
        \`profil_user\` int DEFAULT NULL,
        \`idprofil\` int DEFAULT NULL,
        \`idcompagnie\` int DEFAULT NULL,
        \`etatuser\` enum('0','1') DEFAULT NULL,
        \`ipadress\` varchar(45) DEFAULT NULL,
        \`idinst\` int DEFAULT NULL,
        PRIMARY KEY (\`iduser\`),
        UNIQUE KEY \`email\` (\`email\`),
        UNIQUE KEY \`login\` (\`login\`),
        KEY \`FK_USER_AGENCE\` (\`idag\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`transaction\` (
        \`idtransaction\` int NOT NULL AUTO_INCREMENT,
        \`iduser\` int DEFAULT NULL,
        \`idcompte\` int NOT NULL,
        \`montant_transaction\` decimal(15,2) NOT NULL,
        \`date_transaction\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`references\` varchar(254) DEFAULT NULL,
        \`description\` text,
        \`statut\` enum('complete','annulee','en_attente') DEFAULT 'complete',
        \`type_transaction\` enum('versement','retrait') NOT NULL,
        \`operateur\` varchar(20) DEFAULT NULL,
        \`idcompteimpact\` int DEFAULT NULL,
        \`idoperation\` int DEFAULT NULL,
        PRIMARY KEY (\`idtransaction\`),
        KEY \`FK_TRANSACTION_COMPTE\` (\`idcompte\`),
        KEY \`FK_TRANSACTION_USER\` (\`iduser\`),
        KEY \`idx_transaction_operateur\` (\`operateur\`),
        KEY \`compteImpact\` (\`idcompteimpact\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`notification\` (
        \`idnotification\` int NOT NULL AUTO_INCREMENT,
        \`idclient\` int NOT NULL,
        \`titre\` varchar(120) NOT NULL,
        \`message\` text NOT NULL,
        \`type\` varchar(40) DEFAULT 'versement',
        \`lu\` tinyint(1) NOT NULL DEFAULT 0,
        \`date_creation\` datetime DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`idnotification\`),
        KEY \`FK_NOTIFICATION_CLIENT\` (\`idclient\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`setting\` (
        \`idsetting\` int NOT NULL AUTO_INCREMENT,
        \`operator_actif\` json NOT NULL,
        \`date_creation\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`date_modification\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`idsetting\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`liste_operator\` (
        \`idliste_operator\` int NOT NULL AUTO_INCREMENT,
        \`liste_operator\` json NOT NULL,
        \`date_creation\` datetime DEFAULT CURRENT_TIMESTAMP,
        \`date_modification\` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`idliste_operator\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`compte_pin_otp\` (
        \`id\` int NOT NULL AUTO_INCREMENT,
        \`idcompte\` int NOT NULL,
        \`idclient\` int NOT NULL,
        \`otp_code_hash\` varchar(255) NOT NULL,
        \`expires_at\` datetime NOT NULL,
        \`consumed_at\` datetime DEFAULT NULL,
        \`attempts\` int NOT NULL DEFAULT 0,
        \`created_at\` datetime DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_compte_pin_otp_compte_client\` (\`idcompte\`, \`idclient\`),
        KEY \`idx_compte_pin_otp_expires\` (\`expires_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS \`actualite\` (
        \`idactualite\` int NOT NULL AUTO_INCREMENT,
        \`titre\` varchar(255) NOT NULL,
        \`contenu\` text NOT NULL,
        \`imageUrl\` varchar(255) DEFAULT NULL,
        \`categorie\` varchar(50) DEFAULT NULL,
        \`date_creation\` datetime DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`idactualite\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);

    await this.addConstraintIfMissing(
      queryRunner,
      'clients',
      'fk_client_agence',
      'ADD CONSTRAINT `fk_client_agence` FOREIGN KEY (`idag`) REFERENCES `agence` (`idag`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'typecompte',
      'typecompte_parent_fk',
      'ADD CONSTRAINT `typecompte_parent_fk` FOREIGN KEY (`idparent`) REFERENCES `typecompte` (`idtype`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'compte',
      'clientcompte',
      'ADD CONSTRAINT `clientcompte` FOREIGN KEY (`idclient`) REFERENCES `clients` (`idclient`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'compte',
      'fk_agencecompte',
      'ADD CONSTRAINT `fk_agencecompte` FOREIGN KEY (`idag`) REFERENCES `agence` (`idag`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'compte',
      'FK_COMPTE_TYPECOMPTE',
      'ADD CONSTRAINT `FK_COMPTE_TYPECOMPTE` FOREIGN KEY (`idtype`) REFERENCES `typecompte` (`idtype`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'user',
      'FK_USER_AGENCE',
      'ADD CONSTRAINT `FK_USER_AGENCE` FOREIGN KEY (`idag`) REFERENCES `agence` (`idag`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'transaction',
      'compteImpact',
      'ADD CONSTRAINT `compteImpact` FOREIGN KEY (`idcompteimpact`) REFERENCES `compte` (`idcompte`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'transaction',
      'FK_TRANSACTION_COMPTE',
      'ADD CONSTRAINT `FK_TRANSACTION_COMPTE` FOREIGN KEY (`idcompte`) REFERENCES `compte` (`idcompte`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'notification',
      'FK_NOTIFICATION_CLIENT',
      'ADD CONSTRAINT `FK_NOTIFICATION_CLIENT` FOREIGN KEY (`idclient`) REFERENCES `clients` (`idclient`)',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'compte_pin_otp',
      'FK_OTP_COMPTE',
      'ADD CONSTRAINT `FK_OTP_COMPTE` FOREIGN KEY (`idcompte`) REFERENCES `compte` (`idcompte`) ON DELETE CASCADE',
    );
    await this.addConstraintIfMissing(
      queryRunner,
      'compte_pin_otp',
      'FK_OTP_CLIENT',
      'ADD CONSTRAINT `FK_OTP_CLIENT` FOREIGN KEY (`idclient`) REFERENCES `clients` (`idclient`) ON DELETE CASCADE',
    );

    await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=0');
    await queryRunner.query('DROP TABLE IF EXISTS `actualite`');
    await queryRunner.query('DROP TABLE IF EXISTS `compte_pin_otp`');
    await queryRunner.query('DROP TABLE IF EXISTS `notification`');
    await queryRunner.query('DROP TABLE IF EXISTS `transaction`');
    await queryRunner.query('DROP TABLE IF EXISTS `user`');
    await queryRunner.query('DROP TABLE IF EXISTS `compte`');
    await queryRunner.query('DROP TABLE IF EXISTS `typecompte`');
    await queryRunner.query('DROP TABLE IF EXISTS `app`');
    await queryRunner.query('DROP TABLE IF EXISTS `clients`');
    await queryRunner.query('DROP TABLE IF EXISTS `setting`');
    await queryRunner.query('DROP TABLE IF EXISTS `liste_operator`');
    await queryRunner.query('DROP TABLE IF EXISTS `agence`');
    await queryRunner.query('SET FOREIGN_KEY_CHECKS=1');
  }

  private async addConstraintIfMissing(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    addConstraintSql: string,
  ) {
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
