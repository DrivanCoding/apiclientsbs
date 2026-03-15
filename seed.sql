-- Seed data for SmoothE Collecte database
-- WARNING: use only in development/staging environments when you want sample data.

START TRANSACTION;

-- Agencies
INSERT INTO `agence` (`idag`, `idcompagnie`, `nom_agence`, `alias_agence`, `ville`, `telephone_agence`, `date_ouverture`, `statut_agence`)
VALUES
  (1, 1, 'Agence Centre', 'CENTRE', 'Yaoundé', '222 000 111', '2022-01-02', 'actif'),
  (2, 1, 'Agence Douala', 'DOUALA', 'Douala', '222 000 222', '2023-03-10', 'actif');

-- Types de compte
INSERT INTO `typecompte` (`idtype`, `libelle`, `description`, `taux_interet`, `frais_tenue_compte`, `plafond`, `frais_ouverture`, `frais_retrait`, `code_type`, `idcategorie`, `numero`, `type`)
VALUES
  (1, 'Compte Collecte Libre', 'Compte flexible pour collecte libre', 0.50, 0.00, 1000000.00, 0.00, 0.00, 'CCL', 1, 101, '1'),
  (2, 'Compte Collecte Tontine', 'Compte dédié aux tontines et collectes groupées', 0.75, 0.00, 2000000.00, 0.00, 0.00, 'CCT', 1, 102, '1');

-- Clients (passwords bcrypt hashed for "password123")
INSERT INTO `clients` (`idclient`, `code_client`, `civilite`, `nom`, `prenom`, `date_naissance`, `lieu_naissance`, `nationalite`, `piece_identite`, `num_piece_identite`, `adresse`, `code_postal`, `ville`, `pays`, `telephone_principal`, `email`, `nombre_enfants`, `statut`, `notation_risque`, `mot_de_passe`, `idag`)
VALUES
  (1, 'C-0001', 'M', 'NDONGO', 'Jean', '1985-04-10', 'Yaoundé', 'Cameroun', 'CNI', '18-000112', 'Avenue Kennedy', '1000', 'Yaoundé', 'Cameroun', '699000001', 'jean@collecte.local', 2, 'actif', 'faible', '$2b$10$6k6MRfXO3TZ1/vEJg7gSBeLoZ7C0vR2CbJo1SltcwvG94vBpOylTG', 1),
  (2, 'C-0002', 'Mme', 'NGUETCHUENG', 'Aline', '1990-06-21', 'Bafoussam', 'Cameroun', 'Passeport', 'P000989', 'Quartier Bastos', '1000', 'Yaoundé', 'Cameroun', '699000002', 'aline@collecte.local', 1, 'actif', 'moyen', '$2b$10$6k6MRfXO3TZ1/vEJg7gSBeLoZ7C0vR2CbJo1SltcwvG94vBpOylTG', 2),
  (3, 'C-0003', 'Dr', 'FONDOUMBE', 'Roger', '1978-12-05', 'Douala', 'Cameroun', 'Passeport', 'P001234', 'Bonapriso', '1000', 'Douala', 'Cameroun', '699000003', 'roger@collecte.local', 3, 'actif', 'moyen', '$2b$10$6k6MRfXO3TZ1/vEJg7gSBeLoZ7C0vR2CbJo1SltcwvG94vBpOylTG', 1);

-- Comptes
INSERT INTO `compte` (`idcompte`, `idtype`, `solde`, `date_ouverture`, `statut`, `idclient`, `numero_compte`, `idag`)
VALUES
  (1, 1, 1250000.00, '2024-05-20 09:15:00', 'actif', 1, '378548112345', 1),
  (2, 2, 580000.00, '2025-02-15 14:20:00', 'actif', 2, '378548223456', 2),
  (3, 1, 100500.45, '2024-12-02 11:05:00', 'actif', 3, '378548334567', 1);

-- Setting operateurs actifs (operator_actif JSON: operateur + chapitre comptable idtypecompte)
INSERT INTO `setting` (`idsetting`, `operator_actif`)
VALUES
  (
    1,
    JSON_ARRAY(
      JSON_OBJECT('operateur', 'OM', 'idtypecompte', 1),
      JSON_OBJECT('operateur', 'MOMO', 'idtypecompte', 1),
      JSON_OBJECT('operateur', 'PAYPAL', 'idtypecompte', 2),
      JSON_OBJECT('operateur', 'VISA', 'idtypecompte', 2),
      JSON_OBJECT('operateur', 'MASTERCARD', 'idtypecompte', 2)
    )
  );

-- Liste globale des operateurs (liste_operator JSON: nom + code + date_creation)
INSERT INTO `liste_operator` (`idliste_operator`, `liste_operator`)
VALUES
  (
    1,
    JSON_ARRAY(
      JSON_OBJECT('nom', 'Orange Money', 'code', 'OM', 'date_cration', '2026-03-10'),
      JSON_OBJECT('nom', 'MTN Mobile Money', 'code', 'MOMO', 'date_cration', '2026-03-10'),
      JSON_OBJECT('nom', 'PayPal', 'code', 'PAYPAL', 'date_cration', '2026-03-10'),
      JSON_OBJECT('nom', 'Visa', 'code', 'VISA', 'date_cration', '2026-03-10'),
      JSON_OBJECT('nom', 'Mastercard', 'code', 'MASTERCARD', 'date_cration', '2026-03-10')
    )
  );

-- Notifications
INSERT INTO `notification` (`idnotification`, `idclient`, `titre`, `message`, `type`, `lu`)
VALUES
  (1, 1, 'Versement reussi', 'Votre versement de 25 000 XAF sur le compte 378548112345 a ete confirme.', 'versement', 0),
  (2, 2, 'Versement reussi', 'Votre versement de 10 000 XAF sur le compte 378548223456 a ete confirme.', 'versement', 0);

-- Utilisateurs (personnel)
INSERT INTO `user` (`iduser`, `idag`, `nom`, `prenom`, `email`, `login`, `password`, `statut`)
VALUES
  (1, 1, 'MBOCH', 'Patrick', 'patrick@collecte.local', 'patrick', '$2b$10$nOUIs5kJ7naTuTFkBy1veuEv1qR1/zQ5S8Hq1PhdR6e5W10DQaW/K', 'actif'),
  (2, 2, 'EGbe', 'Marcel', 'marcel@collecte.local', 'marcel', '$2b$10$nOUIs5kJ7naTuTFkBy1veuEv1qR1/zQ5S8Hq1PhdR6e5W10DQaW/K', 'actif');

COMMIT;
