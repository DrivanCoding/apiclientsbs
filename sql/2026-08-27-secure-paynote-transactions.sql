-- Conserve l'identifiant technique retourne par Paynote afin de pouvoir
-- reconcilier un paiement sans confondre order_id et message_id.
ALTER TABLE `transaction`
  ADD COLUMN `provider_message_id` varchar(128) NULL AFTER `references`;

-- MySQL autorise plusieurs valeurs NULL dans un index UNIQUE.
-- Verifier et nettoyer d'eventuels doublons non NULL avant execution si cette
-- colonne avait deja ete ajoutee manuellement sur un environnement.
ALTER TABLE `transaction`
  ADD UNIQUE INDEX `uq_transaction_references` (`references`),
  ADD UNIQUE INDEX `uq_transaction_provider_message_id` (`provider_message_id`);

ALTER TABLE `sbs_ouverture_compte_tampon`
  ADD COLUMN `provider_message_id` varchar(128) NULL AFTER `references`,
  ADD UNIQUE INDEX `uq_ouverture_references` (`references`),
  ADD UNIQUE INDEX `uq_ouverture_provider_message_id` (`provider_message_id`);

ALTER TABLE `sbs_preouverture_client_tampon`
  ADD COLUMN `provider_message_id` varchar(128) NULL AFTER `references`,
  ADD UNIQUE INDEX `uq_preouverture_references` (`references`),
  ADD UNIQUE INDEX `uq_preouverture_provider_message_id` (`provider_message_id`);
