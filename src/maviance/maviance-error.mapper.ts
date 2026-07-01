export class MavianceErrorMapper {
  private static readonly ERROR_MAP: Record<string, string> = {
    '4009':
      'Identifiants Maviance invalides pour cet environnement. Verifiez le token, le secret et l URL S3P.',
    '42001': 'Numero de service ou facture introuvable.',
    '702103': 'Le montant de la transaction depasse le seuil autorise.',
    '703108': 'Solde insuffisant pour effectuer le paiement.',
    '703111': 'La limite du compte client est atteinte.',
    '703112': 'La limite du compte destinataire est atteinte.',
    '703117': 'Le compte client n est pas active pour ce service.',
    '703201': 'Le client n a pas confirme la demande de paiement.',
    '703202': 'Le client a refuse la demande de paiement.',
    '703203': 'Code PIN ou token de confirmation invalide.',
  };

  static mapCode(
    code: string | number | null | undefined,
    defaultMessage = 'Echec de la transaction avec Maviance.',
  ): string {
    if (!code) {
      return defaultMessage;
    }

    const cleanCode = String(code).trim();
    return this.ERROR_MAP[cleanCode] || `${defaultMessage} (Code: ${cleanCode})`;
  }
}
