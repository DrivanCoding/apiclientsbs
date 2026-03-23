-- Migration: operator settings tables + seed defaults
-- Date: 2026-03-23

CREATE TABLE IF NOT EXISTS `liste_operator` (
  `idliste_operator` int NOT NULL AUTO_INCREMENT,
  `liste_operator` json NOT NULL,
  `date_creation` datetime DEFAULT CURRENT_TIMESTAMP,
  `date_modification` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idliste_operator`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `setting` (
  `idsetting` int NOT NULL AUTO_INCREMENT,
  `operator_actif` json NOT NULL,
  `date_creation` datetime DEFAULT CURRENT_TIMESTAMP,
  `date_modification` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`idsetting`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `liste_operator` (`liste_operator`)
SELECT JSON_ARRAY(
  JSON_OBJECT('nom', 'Orange Money', 'code', 'om', 'date_cration', NOW()),
  JSON_OBJECT('nom', 'MTN MoMo', 'code', 'momo', 'date_cration', NOW())
)
WHERE NOT EXISTS (SELECT 1 FROM `liste_operator`);

INSERT INTO `setting` (`operator_actif`)
SELECT JSON_ARRAY(
  JSON_OBJECT('operateur', 'om', 'idtypecompte', 1),
  JSON_OBJECT('operateur', 'momo', 'idtypecompte', 1)
)
WHERE NOT EXISTS (SELECT 1 FROM `setting`);
