CREATE TABLE IF NOT EXISTS `app` (
  `idapp` int NOT NULL AUTO_INCREMENT,
  `nom_app` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `api_key` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `secret_key` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `date_creation` datetime DEFAULT CURRENT_TIMESTAMP,
  `date_modification` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idapp`),
  UNIQUE KEY `api_key` (`api_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
