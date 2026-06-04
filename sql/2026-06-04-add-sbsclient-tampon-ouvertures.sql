-- Tables tampon SBSClient pour preouvertures et ouvertures de compte mobile.
-- A executer sur la base MySQL/MariaDB `clientsbs`.

CREATE TABLE IF NOT EXISTS `sbs_preouverture_client_tampon` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nom` varchar(100) NOT NULL,
  `prenom` varchar(50) DEFAULT NULL,
  `email` varchar(100) NOT NULL,
  `telephone_principal` varchar(20) NOT NULL,
  `mot_de_passe` varchar(255) NOT NULL,
  `type_piece` varchar(50) DEFAULT NULL,
  `num_piece_identite` varchar(50) DEFAULT NULL,
  `adresse` varchar(255) DEFAULT NULL,
  `code_postal` varchar(10) DEFAULT NULL,
  `ville` varchar(50) DEFAULT NULL,
  `idag` int NOT NULL,
  `idtype` int NOT NULL,
  `montant_initial` decimal(15,2) NOT NULL,
  `frais_ouverture` double NOT NULL DEFAULT 0,
  `montant_minimum` decimal(15,2) NOT NULL DEFAULT 0,
  `operateur` varchar(20) NOT NULL,
  `references` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `photo_profil` varchar(255) DEFAULT NULL,
  `signature` varchar(255) DEFAULT NULL,
  `photo_cni` varchar(255) DEFAULT NULL,
  `photo_piece_recto` varchar(255) DEFAULT NULL,
  `photo_piece_verso` varchar(255) DEFAULT NULL,
  `payment_json` longtext DEFAULT NULL,
  `statut_validation` varchar(30) NOT NULL DEFAULT 'pending_validation',
  `message_validation` text DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_preouv_status` (`statut_validation`),
  KEY `idx_preouv_agence` (`idag`),
  KEY `idx_preouv_type` (`idtype`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `sbs_ouverture_compte_tampon` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idclient` int NOT NULL,
  `idtype` int NOT NULL,
  `idag` int DEFAULT NULL,
  `montant_initial` decimal(15,2) NOT NULL,
  `frais_ouverture` double NOT NULL DEFAULT 0,
  `montant_minimum` decimal(15,2) NOT NULL DEFAULT 0,
  `operateur` varchar(20) NOT NULL,
  `numero_telephone` varchar(20) NOT NULL,
  `references` varchar(120) NOT NULL,
  `description` text DEFAULT NULL,
  `payment_json` longtext DEFAULT NULL,
  `statut_validation` varchar(30) NOT NULL DEFAULT 'pending_validation',
  `message_validation` text DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ouv_status` (`statut_validation`),
  KEY `idx_ouv_client_type` (`idclient`, `idtype`),
  KEY `idx_ouv_agence` (`idag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DELIMITER $$

DROP PROCEDURE IF EXISTS add_column_if_missing $$
CREATE PROCEDURE add_column_if_missing(
    IN p_table VARCHAR(128),
    IN p_column VARCHAR(128),
    IN p_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND COLUMN_NAME = p_column
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

CALL add_column_if_missing('sbs_preouverture_client_tampon', 'photo_piece_recto', 'VARCHAR(255) NULL AFTER `photo_cni`');
CALL add_column_if_missing('sbs_preouverture_client_tampon', 'photo_piece_verso', 'VARCHAR(255) NULL AFTER `photo_piece_recto`');

DROP PROCEDURE IF EXISTS add_column_if_missing;
