CREATE TABLE IF NOT EXISTS `compte_pin_otp` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `idcompte` INT NOT NULL,
  `idclient` INT NOT NULL,
  `otp_code_hash` VARCHAR(255) NOT NULL,
  `expires_at` DATETIME NOT NULL,
  `consumed_at` DATETIME NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_compte_pin_otp_lookup` (`idclient`, `idcompte`, `consumed_at`),
  CONSTRAINT `fk_compte_pin_otp_compte`
    FOREIGN KEY (`idcompte`) REFERENCES `compte` (`idcompte`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_compte_pin_otp_client`
    FOREIGN KEY (`idclient`) REFERENCES `clients` (`idclient`)
    ON DELETE CASCADE ON UPDATE CASCADE
);
