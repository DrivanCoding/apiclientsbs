-- phpMyAdmin SQL Dump
-- version 5.2.0
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Jan 14, 2026 at 01:52 PM
-- Server version: 8.0.30
-- PHP Version: 8.1.10

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `collecte`
--

-- --------------------------------------------------------

--
-- Table structure for table `agence`
--

CREATE TABLE `agence` (
  `idag` int NOT NULL,
  `idcompagnie` int NOT NULL,
  `nom_agence` varchar(100) COLLATE utf8mb4_general_ci NOT NULL,
  `alias_agence` varchar(10) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ville` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `telephone_agence` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `date_ouverture` date DEFAULT NULL,
  `statut_agence` enum('actif','hors_service') COLLATE utf8mb4_general_ci DEFAULT 'actif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `clients`
--

CREATE TABLE `clients` (
  `idclient` int NOT NULL,
  `code_client` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `civilite` enum('M','Mme','Mlle','Dr','Pr') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nom` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `prenom` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `date_naissance` date DEFAULT NULL,
  `lieu_naissance` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nom_entreprise` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nationalite` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `piece_identite` enum('CNI','Passeport','Permis','Carte séjour','Extrait naissance','Registre commerce') COLLATE utf8mb4_general_ci NOT NULL,
  `num_piece_identite` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `date_expiration_piece` date DEFAULT NULL,
  `adresse` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `complement_adresse` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `code_postal` varchar(10) COLLATE utf8mb4_general_ci NOT NULL,
  `ville` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `pays` varchar(50) COLLATE utf8mb4_general_ci DEFAULT 'France',
  `telephone_principal` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `telephone_secondaire` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `mot_de_passe` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `profession` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `situation_familiale` enum('célibataire','marié','divorcé','veuf','concubinage','pacsé') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `nombre_enfants` int DEFAULT '0',
  `date_inscription` datetime DEFAULT CURRENT_TIMESTAMP,
  `date_derniere_modif` datetime DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  `statut` enum('actif','inactif','suspendu','décédé') COLLATE utf8mb4_general_ci DEFAULT 'actif',
  `notation_risque` enum('faible','moyen','élevé') COLLATE utf8mb4_general_ci DEFAULT 'faible',
  `commentaires` text COLLATE utf8mb4_general_ci,
  `photo_identite` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `signature` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `idzone` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `compte`
--

CREATE TABLE `compte` (
  `idcompte` int NOT NULL,
  `idtype` int NOT NULL,
  `solde` decimal(15,2) DEFAULT '0.00',
  `date_ouverture` datetime DEFAULT CURRENT_TIMESTAMP,
  `date_derniere_operation` datetime DEFAULT NULL,
  `statut` enum('actif','inactif','bloque') COLLATE utf8mb4_general_ci DEFAULT 'actif',
  `idclient` int DEFAULT NULL,
  `numero_compte` varchar(55) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `idzone` int DEFAULT NULL,
  `idguichet` int DEFAULT NULL,
  `idinst` int DEFAULT NULL,
  `idag` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transaction`
--

CREATE TABLE `transaction` (
  `idtransaction` int NOT NULL,
  `iduser` int NOT NULL,
  `idcompte` int NOT NULL,
  `montant_transaction` decimal(15,2) NOT NULL,
  `date_transaction` datetime DEFAULT CURRENT_TIMESTAMP,
  `references` varchar(254) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `statut` enum('complete','annulee','en_attente') COLLATE utf8mb4_general_ci DEFAULT 'complete',
  `type_transaction` enum('versement','retrait') COLLATE utf8mb4_general_ci NOT NULL,
  `idcompteimpact` int DEFAULT NULL,
  `idoperation` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `typecompte`
--

CREATE TABLE `typecompte` (
  `idtype` int NOT NULL,
  `libelle` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `description` text COLLATE utf8mb4_general_ci,
  `taux_interet` decimal(5,2) DEFAULT '0.00',
  `frais_tenue_compte` decimal(10,2) DEFAULT '0.00',
  `plafond` decimal(15,2) DEFAULT NULL,
  `frais_ouverture` double DEFAULT NULL,
  `frais_retrait` double DEFAULT NULL,
  `code_type` varchar(3) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `idcategorie` int NOT NULL,
  `numero` int NOT NULL,
  `type` enum('1','2','3') COLLATE utf8mb4_general_ci NOT NULL,
  `idparent` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user`
--

CREATE TABLE `user` (
  `iduser` int NOT NULL,
  `idag` int NOT NULL,
  `nom` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `prenom` varchar(50) COLLATE utf8mb4_general_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `telephone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `login` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `adresse` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `date_naissance` date DEFAULT NULL,
  `date_inscription` datetime DEFAULT CURRENT_TIMESTAMP,
  `statut` enum('actif','inactif','bloque') COLLATE utf8mb4_general_ci DEFAULT 'actif',
  `profil_user` int DEFAULT NULL,
  `idprofil` int DEFAULT NULL,
  `idcompagnie` int DEFAULT NULL,
  `etatuser` enum('0','1') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `ipadress` varchar(15) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `idinst` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `agence`
--
ALTER TABLE `agence`
  ADD PRIMARY KEY (`idag`);

--
-- Indexes for table `clients`
--
ALTER TABLE `clients`
  ADD PRIMARY KEY (`idclient`),
  ADD UNIQUE KEY `code_client` (`code_client`);

--
-- Indexes for table `compte`
--
ALTER TABLE `compte`
  ADD PRIMARY KEY (`idcompte`),
  ADD UNIQUE KEY `numero_compte` (`numero_compte`),
  ADD KEY `FK_COMPTE_TYPECOMPTE` (`idtype`),
  ADD KEY `clientcompte` (`idclient`),
  ADD KEY `fk_agencecompte` (`idag`);

--
-- Indexes for table `transaction`
--
ALTER TABLE `transaction`
  ADD PRIMARY KEY (`idtransaction`),
  ADD KEY `FK_TRANSACTION_COMPTE` (`idcompte`),
  ADD KEY `FK_TRANSACTION_USER` (`iduser`),
  ADD KEY `compteImpact` (`idcompteimpact`);

--
-- Indexes for table `typecompte`
--
ALTER TABLE `typecompte`
  ADD PRIMARY KEY (`idtype`),
  ADD KEY `idparent` (`idparent`);

--
-- Indexes for table `user`
--
ALTER TABLE `user`
  ADD PRIMARY KEY (`iduser`),
  ADD UNIQUE KEY `email` (`email`),
  ADD UNIQUE KEY `login` (`login`),
  ADD KEY `FK_USER_AGENCE` (`idag`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `agence`
--
ALTER TABLE `agence`
  MODIFY `idag` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `clients`
--
ALTER TABLE `clients`
  MODIFY `idclient` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `compte`
--
ALTER TABLE `compte`
  MODIFY `idcompte` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `transaction`
--
ALTER TABLE `transaction`
  MODIFY `idtransaction` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `typecompte`
--
ALTER TABLE `typecompte`
  MODIFY `idtype` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `user`
--
ALTER TABLE `user`
  MODIFY `iduser` int NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `compte`
--
ALTER TABLE `compte`
  ADD CONSTRAINT `clientcompte` FOREIGN KEY (`idclient`) REFERENCES `clients` (`idclient`),
  ADD CONSTRAINT `fk_agencecompte` FOREIGN KEY (`idag`) REFERENCES `agence` (`idag`),
  ADD CONSTRAINT `FK_COMPTE_TYPECOMPTE` FOREIGN KEY (`idtype`) REFERENCES `typecompte` (`idtype`);

--
-- Constraints for table `transaction`
--
ALTER TABLE `transaction`
  ADD CONSTRAINT `compteImpact` FOREIGN KEY (`idcompteimpact`) REFERENCES `compte` (`idcompte`),
  ADD CONSTRAINT `FK_TRANSACTION_COMPTE` FOREIGN KEY (`idcompte`) REFERENCES `compte` (`idcompte`),
  ADD CONSTRAINT `FK_TRANSACTION_USER` FOREIGN KEY (`iduser`) REFERENCES `user` (`iduser`);

--
-- Constraints for table `typecompte`
--
ALTER TABLE `typecompte`
  ADD CONSTRAINT `typecompte_ibfk_1` FOREIGN KEY (`idparent`) REFERENCES `typecompte` (`idtype`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
