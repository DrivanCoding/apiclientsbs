-- Mise a jour de la base `clientsbs` pour l'API mobile SBSClient.
-- A executer sur la base utilisee par sbsclient/apiclientsbs.

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

DROP PROCEDURE IF EXISTS create_index_if_missing $$
CREATE PROCEDURE create_index_if_missing(
    IN p_table VARCHAR(128),
    IN p_index VARCHAR(128),
    IN p_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = p_table
          AND INDEX_NAME = p_index
    ) THEN
        SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD ', p_definition);
        PREPARE stmt FROM @sql;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END $$

DELIMITER ;

CALL add_column_if_missing('clients', 'is_first_login', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_column_if_missing('compte', 'pin_code', 'VARCHAR(255) NULL AFTER `numero_compte`');
CALL add_column_if_missing('typecompte', 'mobile_sync_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_column_if_missing('typecompte', 'mobile_can_open', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL add_column_if_missing('typecompte', 'mobile_can_view', 'TINYINT(1) NOT NULL DEFAULT 1');
CALL add_column_if_missing('typecompte', 'mobile_can_deposit', 'TINYINT(1) NOT NULL DEFAULT 1');

CREATE TABLE IF NOT EXISTS `actualite` (
  `idactualite` int NOT NULL AUTO_INCREMENT,
  `titre` varchar(255) NOT NULL,
  `contenu` text NOT NULL,
  `imageUrl` varchar(255) DEFAULT NULL,
  `categorie` varchar(50) DEFAULT NULL,
  `date_creation` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idactualite`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `notification` (
  `idnotification` int NOT NULL AUTO_INCREMENT,
  `idclient` int NOT NULL,
  `titre` varchar(120) NOT NULL,
  `message` text NOT NULL,
  `type` varchar(40) DEFAULT 'versement',
  `lu` tinyint(1) NOT NULL DEFAULT 0,
  `date_creation` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idnotification`),
  KEY `FK_NOTIFICATION_CLIENT` (`idclient`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `compte_pin_otp` (
  `id` int NOT NULL AUTO_INCREMENT,
  `idcompte` int NOT NULL,
  `idclient` int NOT NULL,
  `otp_code_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `consumed_at` datetime DEFAULT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_compte_pin_otp_compte_client` (`idcompte`, `idclient`),
  KEY `idx_compte_pin_otp_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CALL create_index_if_missing('typecompte', 'idx_typecompte_mobile_sync', 'INDEX `idx_typecompte_mobile_sync` (`mobile_sync_enabled`)');
CALL create_index_if_missing('notification', 'idx_notification_client_lu', 'INDEX `idx_notification_client_lu` (`idclient`, `lu`)');

DROP PROCEDURE IF EXISTS add_column_if_missing;
DROP PROCEDURE IF EXISTS create_index_if_missing;
