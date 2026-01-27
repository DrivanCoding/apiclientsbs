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
INSERT INTO `clients` (`idclient`, `code_client`, `civilite`, `nom`, `prenom`, `date_naissance`, `lieu_naissance`, `nationalite`, `piece_identite`, `num_piece_identite`, `adresse`, `code_postal`, `ville`, `pays`, `telephone_principal`, `email`, `nombre_enfants`, `statut`, `notation_risque`, `mot_de_passe`)
VALUES
  (1, 'C-0001', 'M', 'NDONGO', 'Jean', '1985-04-10', 'Yaoundé', 'Cameroun', 'CNI', '18-000112', 'Avenue Kennedy', '1000', 'Yaoundé', 'Cameroun', '699000001', 'jean@collecte.local', 2, 'actif', 'faible', '$2b$10$6k6MRfXO3TZ1/vEJg7gSBeLoZ7C0vR2CbJo1SltcwvG94vBpOylTG'),
  (2, 'C-0002', 'Mme', 'NGUETCHUENG', 'Aline', '1990-06-21', 'Bafoussam', 'Cameroun', 'Passeport', 'P000989', 'Quartier Bastos', '1000', 'Yaoundé', 'Cameroun', '699000002', 'aline@collecte.local', 1, 'actif', 'moyen', '$2b$10$6k6MRfXO3TZ1/vEJg7gSBeLoZ7C0vR2CbJo1SltcwvG94vBpOylTG'),
  (3, 'C-0003', 'Dr', 'FONDOUMBE', 'Roger', '1978-12-05', 'Douala', 'Cameroun', 'Passeport', 'P001234', 'Bonapriso', '1000', 'Douala', 'Cameroun', '699000003', 'roger@collecte.local', 3, 'actif', 'moyen', '$2b$10$6k6MRfXO3TZ1/vEJg7gSBeLoZ7C0vR2CbJo1SltcwvG94vBpOylTG');

-- Comptes
INSERT INTO `compte` (`idcompte`, `idtype`, `solde`, `date_ouverture`, `statut`, `idclient`, `numero_compte`, `idag`)
VALUES
  (1, 1, 1250000.00, '2024-05-20 09:15:00', 'actif', 1, '378548112345', 1),
  (2, 2, 580000.00, '2025-02-15 14:20:00', 'actif', 2, '378548223456', 2),
  (3, 1, 100500.45, '2024-12-02 11:05:00', 'actif', 3, '378548334567', 1);

-- Utilisateurs (personnel)
INSERT INTO `user` (`iduser`, `idag`, `nom`, `prenom`, `email`, `login`, `password`, `statut`)
VALUES
  (1, 1, 'MBOCH', 'Patrick', 'patrick@collecte.local', 'patrick', '$2b$10$nOUIs5kJ7naTuTFkBy1veuEv1qR1/zQ5S8Hq1PhdR6e5W10DQaW/K', 'actif'),
  (2, 2, 'EGbe', 'Marcel', 'marcel@collecte.local', 'marcel', '$2b$10$nOUIs5kJ7naTuTFkBy1veuEv1qR1/zQ5S8Hq1PhdR6e5W10DQaW/K', 'actif');

COMMIT;
