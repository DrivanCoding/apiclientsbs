-- Create Actualites table for sbsclient announcements
CREATE TABLE IF NOT EXISTS `actualite` (
  `idactualite` int NOT NULL AUTO_INCREMENT,
  `titre` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `contenu` text COLLATE utf8mb4_general_ci NOT NULL,
  `imageUrl` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `categorie` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `date_creation` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`idactualite`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
