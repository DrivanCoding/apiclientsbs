ALTER TABLE `transaction`
ADD COLUMN `operateur` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL
AFTER `type_transaction`;

ALTER TABLE `transaction`
ADD KEY `idx_transaction_operateur` (`operateur`);
