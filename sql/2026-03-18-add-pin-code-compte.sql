ALTER TABLE `compte`
ADD COLUMN `pin_code` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL
AFTER `numero_compte`;
