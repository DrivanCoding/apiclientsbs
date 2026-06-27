export class MavianceErrorMapper {
  private static readonly ERROR_MAP: Record<string, string> = {
    '42001': 'Numéro de service ou facture introuvable.',
    '703112': 'La limite du compte destinataire est atteinte.',
    '703111': 'La limite du compte client est atteinte.',
    '703203': 'Code PIN ou token de confirmation invalide.',
    '703108': 'Solde insuffisant pour effectuer le paiement.',
    '703117': 'Le compte client n\'est pas activé pour ce service.',
    '703202': 'Le client a refusé la demande de paiement.',
    '703201': 'Le client n\'a pas confirmé la demande de paiement.',
    '702103': 'Le montant de la transaction dépasse le seuil autorisé.',
  };

  /**
   * Maps a Maviance/Smobilpay error code or status to a clear user-facing message.
   * 
   * @param code The error code returned by the API
   * @param defaultMessage A fallback message if the code is unknown
   */
  static mapCode(code: string | number | null | undefined, defaultMessage = 'Échec de la transaction avec Maviance.'): string {
    if (!code) {
      return defaultMessage;
    }
    const cleanCode = String(code).trim();
    return this.ERROR_MAP[cleanCode] || `${defaultMessage} (Code: ${cleanCode})`;
  }
}
