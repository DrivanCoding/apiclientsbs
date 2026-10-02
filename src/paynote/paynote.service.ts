import { Injectable, Logger } from '@nestjs/common';

export type TokenResponse = {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in: number;
};

export type MutualizedPayRequest = {
  subscriberMsisdn: string;
  orderId: string;
  amount: string | number;
  description: string;
  notifUrl?: string;
  customerKey?: string;
  customerSecret?: string;
  paymentMethod?: string;
};

export type MutualizedStatusRequest = {
  messageId: string;
  paymentMethod?: string;
  customerKey?: string;
  customerSecret?: string;
};

export type OrangePayRequest = MutualizedPayRequest;
export type OrangeStatusRequest = MutualizedStatusRequest;

export type MtnPayRequest = MutualizedPayRequest;
export type MtnStatusRequest = MutualizedStatusRequest;

export type ProviderFault = {
  code?: string;
  message?: string;
  description?: string;
};

export type PaynoteErrorCategory =
  | 'INVALID_CREDENTIALS'
  | 'INVALID_PAYMENT'
  | 'PROVIDER_ERROR';

export type InvalidPaymentReason =
  | 'INSUFFICIENT_BALANCE'
  | 'SUBSCRIBER_NOT_FOUND'
  | 'INVALID_SUBSCRIBER'
  | 'USER_CANCELLED'
  | 'PAYMENT_TIMEOUT'
  | 'INVALID_AMOUNT'
  | 'DUPLICATE_TRANSACTION'
  | 'PAYMENT_REJECTED';

export type CredentialScope =
  | 'oauth2_token'
  | 'merchant_keys'
  | 'legacy_merchant'
  | 'configuration';

export class PaynoteProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: string,
    readonly fault: ProviderFault = {},
    readonly category: PaynoteErrorCategory = 'PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'PaynoteProviderError';
  }
}

export class PaynoteInvalidCredentialsError extends PaynoteProviderError {
  constructor(
    message: string,
    status: number,
    operation: string,
    fault: ProviderFault = {},
    readonly credentialScope: CredentialScope = 'merchant_keys',
  ) {
    super(message, status, operation, fault, 'INVALID_CREDENTIALS');
    this.name = 'PaynoteInvalidCredentialsError';
  }
}

export class PaynoteInvalidPaymentError extends PaynoteProviderError {
  constructor(
    message: string,
    status: number,
    operation: string,
    fault: ProviderFault = {},
    readonly reason: InvalidPaymentReason = 'PAYMENT_REJECTED',
  ) {
    super(message, status, operation, fault, 'INVALID_PAYMENT');
    this.name = 'PaynoteInvalidPaymentError';
  }
}

type PaynoteScope = 'orange' | 'mtn' | 'general';

type TokenCacheEntry = {
  token: string | null;
  expiresAt: number;
  promise: Promise<string> | null;
};

@Injectable()
export class PaynoteService {
  private readonly logger = new Logger(PaynoteService.name);
  private readonly tokenCache = new Map<PaynoteScope, TokenCacheEntry>();

  private usesLegacyOrangeApi() {
    return (
      String(process.env.PAYNOTE_ORANGE_MODE || 'mutualized')
        .trim()
        .toLowerCase() === 'legacy'
    );
  }

  private getLegacyOrangeBaseUrl() {
    const raw = String(
      process.env.PAYNOTE_ORANGE_DIRECT_API_BASE || 'https://api-s1.orange.cm',
    )
      .trim()
      .replace(/\/+$/, '');

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('PAYNOTE_ORANGE_DIRECT_API_BASE invalide');
    }
    if (url.protocol !== 'https:') {
      throw new Error('PAYNOTE_ORANGE_DIRECT_API_BASE doit utiliser HTTPS');
    }
    return raw;
  }

  private getTokenUrl(scope?: PaynoteScope) {
    if (scope === 'orange' && this.usesLegacyOrangeApi()) {
      return `${this.getLegacyOrangeBaseUrl()}/token`;
    }

    const specific =
      scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_TOKEN_URL
        : scope === 'mtn'
          ? process.env.PAYNOTE_MTN_TOKEN_URL
          : undefined;
    const generic =
      process.env.PAYNOTE_TOKEN_URL || process.env.PAYNOTE_MUTUALIZED_TOKEN_URL;
    const chosen =
      specific ||
      generic ||
      process.env.PAYNOTE_ORANGE_TOKEN_URL ||
      process.env.PAYNOTE_MTN_TOKEN_URL ||
      'https://omapi-token.ynote.africa/oauth2/token';

    // Si une ancienne URL directe WSO2 Orange était renseignée, basculer automatiquement sur Paynote unifié
    if (chosen.includes('api-s1.orange.cm')) {
      return 'https://omapi-token.ynote.africa/oauth2/token';
    }
    return chosen;
  }

  private getCredentials(scope?: PaynoteScope) {
    if (scope === 'orange' && this.usesLegacyOrangeApi()) {
      return {
        key: process.env.PAYNOTE_ORANGE_CUSTOMER_KEY || '',
        secret: process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET || '',
      };
    }

    const scopedClientId =
      scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_ID
        : scope === 'mtn'
          ? process.env.PAYNOTE_MTN_TOKEN_CLIENT_ID
          : undefined;
    const scopedClientSecret =
      scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_SECRET
        : scope === 'mtn'
          ? process.env.PAYNOTE_MTN_TOKEN_CLIENT_SECRET
          : undefined;
    // La nouvelle API Orange distingue les identifiants OAuth2
    // (ClientId/ClientSecret) des cles placees dans le corps du paiement.
    const key =
      scopedClientId ||
      process.env.PAYNOTE_CLIENT_ID ||
      process.env.PAYNOTE_MUTUALIZED_CLIENT_ID ||
      '';

    const secret =
      scopedClientSecret ||
      process.env.PAYNOTE_CLIENT_SECRET ||
      process.env.PAYNOTE_MUTUALIZED_CLIENT_SECRET ||
      '';

    return { key, secret };
  }

  private getTimeoutMs(scope: PaynoteScope = 'general') {
    const specific =
      scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_TIMEOUT_MS
        : scope === 'mtn'
          ? process.env.PAYNOTE_MTN_TIMEOUT_MS
          : undefined;
    const raw = Number(specific || process.env.PAYNOTE_TIMEOUT_MS || 90000);
    return Number.isFinite(raw) && raw > 0 ? raw : 90000;
  }

  private getApiBase(scope?: PaynoteScope) {
    const specific =
      scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_API_BASE
        : scope === 'mtn'
          ? process.env.PAYNOTE_MTN_API_BASE
          : undefined;
    const generic =
      process.env.PAYNOTE_API_BASE || process.env.PAYNOTE_MUTUALIZED_API_BASE;
    const chosen =
      specific ||
      generic ||
      process.env.PAYNOTE_ORANGE_API_BASE ||
      process.env.PAYNOTE_MTN_API_BASE ||
      'https://omapi.ynote.africa/prod';

    // Si une ancienne URL directe WSO2 Orange était renseignée, basculer automatiquement sur Paynote unifié
    if (chosen.includes('api-s1.orange.cm')) {
      return 'https://omapi.ynote.africa/prod';
    }
    return chosen;
  }

  private getCustomerKey(scope?: PaynoteScope) {
    return (
      (scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_CUSTOMER_KEY
        : undefined) ||
      (scope === 'mtn' ? process.env.PAYNOTE_MTN_CUSTOMER_KEY : undefined) ||
      process.env.PAYNOTE_CUSTOMER_KEY ||
      ''
    );
  }

  private getCustomerSecret(scope?: PaynoteScope) {
    return (
      (scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET
        : undefined) ||
      (scope === 'mtn' ? process.env.PAYNOTE_MTN_CUSTOMER_SECRET : undefined) ||
      process.env.PAYNOTE_CUSTOMER_SECRET ||
      ''
    );
  }

  private getNotifUrl(scope?: PaynoteScope) {
    return (
      (scope === 'orange' ? process.env.PAYNOTE_ORANGE_NOTIF_URL : undefined) ||
      (scope === 'mtn' ? process.env.PAYNOTE_MTN_NOTIF_URL : undefined) ||
      process.env.PAYNOTE_NOTIF_URL ||
      ''
    );
  }

  private getTokenEntry(scope: PaynoteScope): TokenCacheEntry {
    return (
      this.tokenCache.get(scope) || {
        token: null,
        expiresAt: 0,
        promise: null,
      }
    );
  }

  private isTokenValid(entry: TokenCacheEntry) {
    return Boolean(entry.token) && Date.now() < entry.expiresAt;
  }

  async getAccessToken(scope: PaynoteScope = 'general'): Promise<string> {
    const entry = this.getTokenEntry(scope);
    if (this.isTokenValid(entry) && entry.token) return entry.token;
    if (entry.promise !== null) return entry.promise;

    const promise = this.fetchAccessToken(scope, {
      tokenUrl: this.getTokenUrl(scope),
      credentials: this.getCredentials(scope),
    }).finally(() => {
      const current = this.getTokenEntry(scope);
      this.tokenCache.set(scope, { ...current, promise: null });
    });
    this.tokenCache.set(scope, { ...entry, promise });

    return promise;
  }

  async getOrangeAccessToken(): Promise<string> {
    return this.getAccessToken('orange');
  }

  async getMutualizedAccessToken(): Promise<string> {
    return this.getAccessToken('mtn');
  }

  private clearAccessToken(scope: PaynoteScope) {
    this.tokenCache.delete(scope);
  }

  private async fetchAccessToken(
    scope: PaynoteScope,
    params: {
      tokenUrl: string;
      credentials: { key: string; secret: string };
    },
  ): Promise<string> {
    const { key, secret } = params.credentials;
    if (!key || !secret) {
      const credentialPrefix =
        scope === 'orange'
          ? this.usesLegacyOrangeApi()
            ? 'PAYNOTE_ORANGE_CUSTOMER_KEY/SECRET'
            : 'PAYNOTE_ORANGE_TOKEN_CLIENT_ID/SECRET'
          : scope === 'mtn'
            ? 'PAYNOTE_MTN_TOKEN_CLIENT_ID/SECRET'
            : 'PAYNOTE_CLIENT_ID/SECRET';
      throw new PaynoteInvalidCredentialsError(
        `[CLE_INVALIDE] Configuration Paynote manquante (${credentialPrefix})`,
        400,
        `token:${scope}`,
        { code: 'MISSING_CREDENTIALS', message: `Missing ${credentialPrefix}` },
        'oauth2_token',
      );
    }

    const auth = Buffer.from(`${key}:${secret}`, 'utf8').toString('base64');
    const formData = new URLSearchParams();
    formData.set('grant_type', 'client_credentials');

    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs(scope);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(params.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: formData.toString(),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw this.providerError(`token:${scope}`, res.status, text, scope);
      }
      const data = (await res.json()) as TokenResponse;
      if (!data?.access_token) {
        throw new Error('Paynote token response invalide');
      }
      const expiresInMs = Math.max(1, Number(data.expires_in || 0)) * 1000;
      const ttlMs = Math.max(
        1_000,
        expiresInMs - Math.min(30_000, expiresInMs / 10),
      );
      const current = this.getTokenEntry(scope);
      this.tokenCache.set(scope, {
        ...current,
        token: data.access_token,
        expiresAt: Date.now() + ttlMs,
      });
      return data.access_token;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PaynoteProviderError(
          `[ERREUR_FOURNISSEUR] Paynote token timeout (${params.tokenUrl}) apres ${timeoutMs}ms`,
          504,
          `token:${scope}`,
          { code: 'TIMEOUT', message: `Timeout apres ${timeoutMs}ms` },
          'PROVIDER_ERROR',
        );
      }
      if (error instanceof PaynoteProviderError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'erreur inconnue';
      throw new PaynoteProviderError(
        `[ERREUR_FOURNISSEUR] Paynote token fetch failed (${params.tokenUrl}): ${message}`,
        502,
        `token:${scope}`,
        { message },
        'PROVIDER_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJsonWithFreshToken(
    baseUrl: string,
    path: string,
    buildInit: (token: string) => RequestInit,
    scope: PaynoteScope = 'general',
  ) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getAccessToken(scope);
      try {
        return await this.fetchJsonFrom(baseUrl, path, buildInit(token), scope);
      } catch (error) {
        if (attempt === 0 && this.isInvalidTokenError(error)) {
          this.clearAccessToken(scope);
          continue;
        }
        throw error;
      }
    }
    throw new Error('Paynote retry epuise');
  }

  private async fetchJsonFrom(
    baseUrl: string,
    path: string,
    init: RequestInit,
    scope: PaynoteScope,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeoutMs = this.getTimeoutMs(scope);
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${baseUrl}${path}`;
      if (path.includes('webpayment') || path.includes('/mp/')) {
        this.logger.log(
          `[PAYNOTE_HTTP_REQ] ${init.method || 'GET'} ${url} -> Body: ${init.body ? String(init.body) : 'aucun'}`,
        );
      }
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      let text = '';
      let payload: unknown = {};
      if (typeof res.text === 'function') {
        text = await res.text().catch(() => '');
      }
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = {};
        }
      } else if (typeof res.json === 'function') {
        payload = await res.json().catch(() => ({}));
        text = JSON.stringify(payload);
      }

      if (path.includes('webpayment') || path.includes('/mp/')) {
        this.logger.log(
          `[PAYNOTE_HTTP_RES] ${init.method || 'GET'} ${url} -> HTTP ${res.status}: ${text}`,
        );
      }
      if (!res.ok) {
        throw this.providerError(path, res.status, text, scope);
      }
      const record =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : {};
      return this.assertNoInitError(record, path, scope);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PaynoteProviderError(
          `[ERREUR_FOURNISSEUR] Paynote timeout (${baseUrl}${path}) apres ${timeoutMs}ms`,
          504,
          path,
          { code: 'TIMEOUT', message: `Timeout apres ${timeoutMs}ms` },
          'PROVIDER_ERROR',
        );
      }
      if (error instanceof PaynoteProviderError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'erreur inconnue';
      throw new PaynoteProviderError(
        `[ERREUR_FOURNISSEUR] Paynote fetch failed (${baseUrl}${path}): ${message}`,
        502,
        path,
        { message },
        'PROVIDER_ERROR',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private assertNoInitError(
    payload: Record<string, unknown>,
    path: string,
    scope: PaynoteScope,
  ): Record<string, unknown> {
    // Ne s'applique qu'a l'initiation de paiement mutualise (/webpayment)
    if (!path.endsWith('/webpayment')) {
      return payload;
    }

    const code = this.findStringField(payload, [
      'StatusCode',
      'ErrorCode',
      'errorCode',
      'statusCode',
      'code',
    ]);
    const message = this.findStringField(payload, [
      'ErrorMessage',
      'errorMessage',
      'message',
      'body',
      'description',
      'Reason',
    ]);

    const isSuccess =
      (code === '200' || code === '201' || !code) &&
      (String(payload.body || '').toLowerCase().includes('accepted') ||
        Boolean(this.findStringField(payload, ['MessageId', 'message_id', 'messageId'])));

    if (isSuccess) {
      return payload;
    }

    const errorText = `${code} ${message}`.toLowerCase();

    // Verification des cles invalides dans le corps JSON
    if (
      code === '401' ||
      code === '403' ||
      code === '900901' ||
      code === '900902' ||
      errorText.includes('invalid credentials') ||
      errorText.includes('invalid customer') ||
      errorText.includes('invalid customerkey') ||
      errorText.includes('invalid customersecret') ||
      errorText.includes('customerkey') ||
      errorText.includes('customersecret') ||
      errorText.includes('unauthorized') ||
      errorText.includes('could not verify client')
    ) {
      throw this.providerError(
        path,
        code ? Number(code) || 401 : 401,
        JSON.stringify(payload),
        scope,
      );
    }

    const failure = this.detectPaymentFailureReason(
      errorText,
      message,
      scope === 'orange' ? 'Orange' : scope === 'mtn' ? 'MTN' : 'Paynote',
    );
    if (failure) {
      throw new PaynoteInvalidPaymentError(
        failure.message,
        code ? Number(code) || 400 : 400,
        path,
        { code, message },
        failure.reason,
      );
    }

    if (code && !['200', '201', '0'].includes(code)) {
      throw this.providerError(
        path,
        Number(code) || 400,
        JSON.stringify(payload),
        scope,
      );
    }

    return payload;
  }

  private providerError(
    operation: string,
    status: number,
    rawBody: string,
    scope: PaynoteScope = 'general',
  ): PaynoteProviderError {
    const fault = this.extractProviderFault(rawBody);
    const code = String(fault.code || '').trim();
    const message = String(fault.message || '').trim();
    const description = String(fault.description || '').trim();
    const fullText = `${code} ${message} ${description} ${rawBody}`.toLowerCase();

    const effectiveScope: PaynoteScope =
      operation.includes('orange') || scope === 'orange'
        ? 'orange'
        : operation.includes('mtn') || scope === 'mtn'
          ? 'mtn'
          : scope;
    const scopeLabel =
      effectiveScope === 'orange'
        ? 'Orange'
        : effectiveScope === 'mtn'
          ? 'MTN'
          : 'Paynote';

    // 1. Detection des erreurs de cles / identifiants / authentification
    const isCredentialsError =
      status === 401 ||
      status === 403 ||
      code === '900901' ||
      code === '900902' ||
      code === '401' ||
      code === '403' ||
      fullText.includes('invalid credentials') ||
      fullText.includes('invalid credential') ||
      fullText.includes('invalid customer') ||
      fullText.includes('invalid customerkey') ||
      fullText.includes('invalid customersecret') ||
      fullText.includes('invalid_client') ||
      fullText.includes('unauthorized') ||
      fullText.includes('access denied') ||
      fullText.includes('customerkey') ||
      fullText.includes('customersecret') ||
      fullText.includes('bad client credentials') ||
      fullText.includes('could not verify client') ||
      fullText.includes('identite marchande') ||
      fullText.includes('x-auth-token') ||
      fullText.includes('cle invalide') ||
      fullText.includes('clef invalide');

    if (isCredentialsError) {
      const isLegacyOrange =
        this.usesLegacyOrangeApi() &&
        (operation === 'token:orange' || operation.includes('/omcoreapis/'));

      if (isLegacyOrange) {
        const msg = operation.startsWith('token:')
          ? "[CLE_INVALIDE] Authentification ancienne API Orange refusee. Verifiez l'ancienne CustomerKey et l'ancien CustomerSecret fournis par Paynote."
          : "[CLE_INVALIDE] Authentification ancienne API Orange refusee. Verifiez le X-AUTH-TOKEN et l'acces marchand fournis par Paynote.";
        return new PaynoteInvalidCredentialsError(
          msg,
          status,
          operation,
          fault,
          isLegacyOrange ? 'legacy_merchant' : 'merchant_keys',
        );
      }

      const isOAuthTokenFault =
        operation.startsWith('token:') ||
        code === '900901' ||
        code === '900902' ||
        description.toLowerCase().includes('access failure for api') ||
        message.toLowerCase().includes('access failure for api');

      if (isOAuthTokenFault) {
        const clientIdVar =
          effectiveScope === 'orange'
            ? 'PAYNOTE_ORANGE_TOKEN_CLIENT_ID'
            : effectiveScope === 'mtn'
              ? 'PAYNOTE_MTN_TOKEN_CLIENT_ID'
              : 'PAYNOTE_CLIENT_ID';
        const clientSecretVar =
          effectiveScope === 'orange'
            ? 'PAYNOTE_ORANGE_TOKEN_CLIENT_SECRET'
            : effectiveScope === 'mtn'
              ? 'PAYNOTE_MTN_TOKEN_CLIENT_SECRET'
              : 'PAYNOTE_CLIENT_SECRET';
        const detailSuffix =
          message || description ? ` Detail: ${message || description}.` : '';
        const actionLabel = operation.startsWith('token:')
          ? 'generation du jeton'
          : 'validation du jeton d acces';
        return new PaynoteInvalidCredentialsError(
          `[CLE_INVALIDE] Authentification Paynote refusee lors de la ${actionLabel}. Verifiez le ClientId (${clientIdVar}) et le ClientSecret (${clientSecretVar}) du nouvel acces OAuth2 de cet operateur.${detailSuffix}`,
          status,
          operation,
          fault,
          'oauth2_token',
        );
      }

      const keyVar =
        effectiveScope === 'orange'
          ? 'PAYNOTE_ORANGE_CUSTOMER_KEY'
          : effectiveScope === 'mtn'
            ? 'PAYNOTE_MTN_CUSTOMER_KEY'
            : 'PAYNOTE_CUSTOMER_KEY';
      const secretVar =
        effectiveScope === 'orange'
          ? 'PAYNOTE_ORANGE_CUSTOMER_SECRET'
          : effectiveScope === 'mtn'
            ? 'PAYNOTE_MTN_CUSTOMER_SECRET'
            : 'PAYNOTE_CUSTOMER_SECRET';
      const detailSuffix =
        message || description ? ` Detail: ${message || description}.` : '';
      return new PaynoteInvalidCredentialsError(
        `[CLE_INVALIDE] Authentification Paynote refusee lors de la requete de paiement. Verifiez les nouvelles valeurs CustomerKey (${keyVar}) et CustomerSecret (${secretVar}) de cet operateur.${detailSuffix}`,
        status,
        operation,
        fault,
        'merchant_keys',
      );
    }

    if (code === '900902') {
      return new PaynoteInvalidCredentialsError(
        '[CLE_INVALIDE] Identifiants Paynote manquants. Verifiez le header Authorization.',
        status,
        operation,
        fault,
        'oauth2_token',
      );
    }

    // 2. Detection des erreurs de paiement invalide (solde, numero, annulation, timeout, montant)
    const paymentFailure = this.detectPaymentFailureReason(
      fullText,
      message || description,
      scopeLabel,
    );
    if (paymentFailure) {
      return new PaynoteInvalidPaymentError(
        paymentFailure.message,
        status,
        operation,
        fault,
        paymentFailure.reason,
      );
    }

    // 3. Erreur fournisseur generique (Passerelle Paynote, reseau, etc.)
    const suffix = code
      ? ` Code fournisseur: ${code}.`
      : message || description
        ? ` Detail fournisseur: ${message || description}.`
        : '';

    return new PaynoteProviderError(
      `[ERREUR_FOURNISSEUR] Service Paynote indisponible (HTTP ${status}).${suffix}`,
      status,
      operation,
      fault,
      'PROVIDER_ERROR',
    );
  }

  private detectPaymentFailureReason(
    text: string,
    rawDetail?: string,
    operatorLabel: string = 'Orange',
  ): { reason: InvalidPaymentReason; message: string } | null {
    const lower = text.toLowerCase();

    // Solde insuffisant
    if (
      lower.includes('insufficient') ||
      lower.includes('solde insuffisant') ||
      lower.includes('low balance') ||
      lower.includes('not enough balance') ||
      lower.includes('fonds insuffisants')
    ) {
      return {
        reason: 'INSUFFICIENT_BALANCE',
        message: `[PAIEMENT_INVALIDE] Solde ${operatorLabel} Money insuffisant sur le compte du client pour effectuer cette transaction.`,
      };
    }

    // Abonne invalide / non trouve / inactif
    if (
      lower.includes('subscriber not found') ||
      lower.includes('subscriber invalid') ||
      lower.includes('invalid subscriber') ||
      lower.includes('msisdn not found') ||
      lower.includes('unregistered subscriber') ||
      lower.includes('non abonne') ||
      lower.includes('non abonné') ||
      lower.includes('compte inactif') ||
      lower.includes('compte bloque') ||
      lower.includes('compte bloqué') ||
      lower.includes('compte suspendu') ||
      lower.includes('subscriber blocked')
    ) {
      return {
        reason: 'SUBSCRIBER_NOT_FOUND',
        message: `[PAIEMENT_INVALIDE] Numero client non eligible ou inactif sur ${operatorLabel} Money.`,
      };
    }

    // Refus / annulation client / mauvais PIN
    if (
      lower.includes('cancelled') ||
      lower.includes('canceled') ||
      lower.includes('annule') ||
      lower.includes('annulé') ||
      lower.includes('declined') ||
      lower.includes('refuse') ||
      lower.includes('refusé') ||
      lower.includes('user reject') ||
      lower.includes('wrong pin') ||
      lower.includes('pin incorrect')
    ) {
      return {
        reason: 'USER_CANCELLED',
        message: `[PAIEMENT_INVALIDE] Paiement ${operatorLabel} refuse ou annule par le client sur son telephone (ou code PIN incorrect).`,
      };
    }

    // Timeout / Delai expire
    if (
      lower.includes('timeout') ||
      lower.includes('expired') ||
      lower.includes('expire') ||
      lower.includes('expiré') ||
      lower.includes('delai depasse') ||
      lower.includes('délai dépassé')
    ) {
      return {
        reason: 'PAYMENT_TIMEOUT',
        message: `[PAIEMENT_INVALIDE] Delai de validation du paiement ${operatorLabel} Money expire sur le telephone du client.`,
      };
    }

    // Montant invalide
    if (
      lower.includes('invalid amount') ||
      lower.includes('montant invalide') ||
      lower.includes('amount invalid') ||
      lower.includes('limit') ||
      lower.includes('plafond') ||
      lower.includes('out of range')
    ) {
      return {
        reason: 'INVALID_AMOUNT',
        message: `[PAIEMENT_INVALIDE] Montant invalide ou plafond ${operatorLabel} Money depasse pour ce client.`,
      };
    }

    // Doublon
    if (
      lower.includes('duplicate') ||
      lower.includes('already exists') ||
      lower.includes('deja utilise') ||
      lower.includes('déjà utilisé')
    ) {
      return {
        reason: 'DUPLICATE_TRANSACTION',
        message: `[PAIEMENT_INVALIDE] Reference de paiement deja traitee ou commande dupliquee (${operatorLabel}).`,
      };
    }

    // Rejet generique avec detail
    if (
      lower.includes('fail') ||
      lower.includes('echec') ||
      lower.includes('échec') ||
      lower.includes('reject')
    ) {
      const detail = (rawDetail || '').trim();
      return {
        reason: 'PAYMENT_REJECTED',
        message: `[PAIEMENT_INVALIDE] Paiement ${operatorLabel} rejete par l operateur${detail ? ` : ${detail}` : '.'}`,
      };
    }

    return null;
  }

  private extractProviderFault(rawBody: string): ProviderFault {
    const body = String(rawBody || '').trim();
    if (!body) return {};

    try {
      const parsed = JSON.parse(body) as unknown;
      const fault = this.extractProviderFaultFromJson(parsed);
      if (fault.code || fault.message || fault.description) return fault;
    } catch {
      // Provider can return XML, HTML or plain text.
    }

    const xmlFault: ProviderFault = {
      code: this.matchXmlValue(body, 'code'),
      message: this.matchXmlValue(body, 'message'),
      description: this.matchXmlValue(body, 'description'),
    };
    if (xmlFault.code || xmlFault.message || xmlFault.description) {
      return xmlFault;
    }

    return {
      description: body
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 180),
    };
  }

  private extractProviderFaultFromJson(payload: unknown): ProviderFault {
    if (!payload || typeof payload !== 'object') return {};
    const record = payload as Record<string, unknown>;
    const source =
      record.fault && typeof record.fault === 'object'
        ? (record.fault as Record<string, unknown>)
        : record;

    return {
      code: this.stringValue(
        source.code || source.ErrorCode || source.StatusCode,
      ),
      message: this.stringValue(
        source.message || source.ErrorMessage || source.body,
      ),
      description: this.stringValue(source.description || source.Reason),
    };
  }

  private matchXmlValue(body: string, localName: string): string | undefined {
    const pattern = new RegExp(`<[^>]*:?${localName}[^>]*>([^<]+)<`, 'i');
    const match = body.match(pattern);
    return match?.[1]?.trim();
  }

  private stringValue(value: unknown): string | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim();
    }
    return undefined;
  }

  private findStringField(payload: unknown, fieldNames: string[]) {
    const expected = new Set(fieldNames.map((name) => name.toLowerCase()));
    let found = '';

    const walk = (node: unknown) => {
      if (found || !node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(
        node as Record<string, unknown>,
      )) {
        if (
          expected.has(key.toLowerCase()) &&
          (typeof value === 'string' || typeof value === 'number')
        ) {
          found = String(value).trim();
          return;
        }
        walk(value);
        if (found) return;
      }
    };

    walk(payload);
    return found;
  }

  private assertLegacyOrangeAuthentication(
    payload: Record<string, unknown>,
    operation: string,
  ) {
    const statusCode = this.findStringField(payload, [
      'statusCode',
      'errorCode',
    ]);
    if (statusCode !== '401') return;

    const providerMessage = this.findStringField(payload, [
      'message',
      'errorMessage',
      'description',
    ]);
    throw new PaynoteInvalidCredentialsError(
      "[CLE_INVALIDE] L'ancienne API Orange ne reconnait pas l'identite marchande. Verifiez que le X-AUTH-TOKEN, le channelUserMsisdn et le PIN appartiennent au meme ancien contrat active par Paynote.",
      401,
      operation,
      { code: statusCode, message: providerMessage },
      'legacy_merchant',
    );
  }

  private isInvalidTokenError(error: unknown): boolean {
    if (!(error instanceof PaynoteProviderError)) return false;
    if (
      error instanceof PaynoteInvalidCredentialsError &&
      error.credentialScope === 'merchant_keys'
    ) {
      return false;
    }
    const code = String(error.fault?.code || '').trim();
    const desc = String(error.fault?.description || '').toLowerCase();
    const msg = String(error.fault?.message || '').toLowerCase();
    return (
      code === '900901' ||
      code === '900902' ||
      desc.includes('access failure for api') ||
      desc.includes('token expired') ||
      msg.includes('token expired') ||
      (error instanceof PaynoteInvalidCredentialsError &&
        error.credentialScope === 'oauth2_token')
    );
  }

  private getPaymentMethod(scope: PaynoteScope) {
    if (scope === 'orange') {
      const configured = process.env.PAYNOTE_ORANGE_PAYMENT_METHOD;
      if (configured && configured !== 'ORANGE_CMR') {
        return configured;
      }
      return 'OM_CMR';
    }
    if (scope === 'mtn') {
      return process.env.PAYNOTE_MTN_PAYMENT_METHOD || 'MTN_CMR';
    }
    const general = process.env.PAYNOTE_PAYMENT_METHOD;
    if (general && general !== 'ORANGE_CMR') {
      return general;
    }
    return 'OM_CMR';
  }

  private getStatusPath(scope: PaynoteScope) {
    const configured =
      scope === 'mtn'
        ? process.env.PAYNOTE_MTN_STATUS_PATH
        : scope === 'orange'
          ? process.env.PAYNOTE_ORANGE_STATUS_PATH
          : process.env.PAYNOTE_STATUS_PATH;
    return (
      configured ||
      (scope === 'mtn' ? '/webpaymentmtn/status' : '/webpayment/status')
    );
  }

  private normalizeSubscriberMsisdn(value: string) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('237')) digits = digits.slice(3);
    if (!/^6\d{8}$/.test(digits)) {
      throw new PaynoteInvalidPaymentError(
        '[PAIEMENT_INVALIDE] Numero de paiement invalide. Utilisez un numero camerounais de 9 chiffres commencant par 6.',
        400,
        'validation:subscriberMsisdn',
        { code: 'INVALID_SUBSCRIBER_FORMAT' },
        'INVALID_SUBSCRIBER',
      );
    }
    return digits;
  }

  private validateAmount(value: string | number, scope: PaynoteScope) {
    const amount = Number(value);
    const min = Number(
      scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_MIN_AMOUNT || 10
        : process.env.PAYNOTE_MTN_MIN_AMOUNT || 10,
    );
    const max = Number(
      scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_MAX_AMOUNT || 500000
        : process.env.PAYNOTE_MTN_MAX_AMOUNT || 500000,
    );
    if (!Number.isSafeInteger(amount) || amount < min || amount > max) {
      throw new PaynoteInvalidPaymentError(
        `[PAIEMENT_INVALIDE] Montant Paynote invalide. Le montant doit etre un entier compris entre ${min} et ${max} XAF.`,
        400,
        'validation:amount',
        { code: 'INVALID_AMOUNT' },
        'INVALID_AMOUNT',
      );
    }
    return String(amount);
  }

  private validateNotifUrl(value: string) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error('PAYNOTE_NOTIF_URL invalide');
    }
    if (
      url.hostname === 'example.com' ||
      url.hostname.endsWith('.example.com')
    ) {
      throw new Error(
        'PAYNOTE_NOTIF_URL doit pointer vers le webhook public SBSClient',
      );
    }
    if (
      url.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(url.hostname)
    ) {
      throw new Error('PAYNOTE_NOTIF_URL doit utiliser HTTPS');
    }
    const webhookSecret = String(
      process.env.PAYNOTE_WEBHOOK_SECRET || '',
    ).trim();
    if (!webhookSecret) {
      throw new Error('PAYNOTE_WEBHOOK_SECRET manquant');
    }
    url.searchParams.set('token', webhookSecret);
    return url.toString();
  }

  async mutualizedPay(
    request: MutualizedPayRequest,
    scope: PaynoteScope = 'general',
  ): Promise<Record<string, any>> {
    const customerKey = request.customerKey || this.getCustomerKey(scope);
    const customerSecret =
      request.customerSecret || this.getCustomerSecret(scope);
    const rawNotifUrl = request.notifUrl || this.getNotifUrl(scope);

    const keyVar =
      scope === 'orange'
        ? 'PAYNOTE_ORANGE_CUSTOMER_KEY'
        : scope === 'mtn'
          ? 'PAYNOTE_MTN_CUSTOMER_KEY'
          : 'PAYNOTE_CUSTOMER_KEY';
    const secretVar =
      scope === 'orange'
        ? 'PAYNOTE_ORANGE_CUSTOMER_SECRET'
        : scope === 'mtn'
          ? 'PAYNOTE_MTN_CUSTOMER_SECRET'
          : 'PAYNOTE_CUSTOMER_SECRET';

    if (!customerKey) {
      throw new PaynoteInvalidCredentialsError(
        `[CLE_INVALIDE] Configuration Paynote incomplete : ${keyVar} manquant`,
        400,
        `${scope}:pay`,
        { code: 'MISSING_CUSTOMER_KEY', message: `${keyVar} manquant` },
        'merchant_keys',
      );
    }
    if (!customerSecret) {
      throw new PaynoteInvalidCredentialsError(
        `[CLE_INVALIDE] Configuration Paynote incomplete : ${secretVar} manquant`,
        400,
        `${scope}:pay`,
        { code: 'MISSING_CUSTOMER_SECRET', message: `${secretVar} manquant` },
        'merchant_keys',
      );
    }
    if (!rawNotifUrl) throw new Error('PAYNOTE_NOTIF_URL manquant');

    const notifUrl = this.validateNotifUrl(rawNotifUrl);
    const amount = this.validateAmount(request.amount, scope);
    const subscriberMsisdn = this.normalizeSubscriberMsisdn(
      request.subscriberMsisdn,
    );

    let paymentMethod = request.paymentMethod || this.getPaymentMethod(scope);
    if (paymentMethod === 'ORANGE_CMR' || paymentMethod === 'ORANGE') {
      paymentMethod = 'OM_CMR';
    }

    const payload = {
      API_MUT: {
        customerkey: customerKey,
        customersecret: customerSecret,
        order_id: request.orderId,
        description: request.description,
        amount,
        subscriberMsisdn,
        notifUrl,
        PaiementMethod: paymentMethod,
      },
    };

    const baseUrl = this.getApiBase(scope);
    return this.fetchJsonWithFreshToken(
      baseUrl,
      '/webpayment',
      (token) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
      scope,
    );
  }

  async mutualizedPaymentStatus(
    request: MutualizedStatusRequest,
    scope: PaynoteScope = 'general',
  ): Promise<Record<string, any>> {
    const customerKey = request.customerKey || this.getCustomerKey(scope);
    const customerSecret =
      request.customerSecret || this.getCustomerSecret(scope);

    const keyVar =
      scope === 'orange'
        ? 'PAYNOTE_ORANGE_CUSTOMER_KEY'
        : scope === 'mtn'
          ? 'PAYNOTE_MTN_CUSTOMER_KEY'
          : 'PAYNOTE_CUSTOMER_KEY';
    const secretVar =
      scope === 'orange'
        ? 'PAYNOTE_ORANGE_CUSTOMER_SECRET'
        : scope === 'mtn'
          ? 'PAYNOTE_MTN_CUSTOMER_SECRET'
          : 'PAYNOTE_CUSTOMER_SECRET';

    if (!customerKey) {
      throw new PaynoteInvalidCredentialsError(
        `[CLE_INVALIDE] Configuration Paynote incomplete : ${keyVar} manquant`,
        400,
        `${scope}:status`,
        { code: 'MISSING_CUSTOMER_KEY', message: `${keyVar} manquant` },
        'merchant_keys',
      );
    }
    if (!customerSecret) {
      throw new PaynoteInvalidCredentialsError(
        `[CLE_INVALIDE] Configuration Paynote incomplete : ${secretVar} manquant`,
        400,
        `${scope}:status`,
        { code: 'MISSING_CUSTOMER_SECRET', message: `${secretVar} manquant` },
        'merchant_keys',
      );
    }

    const messageId = String(request.messageId || '').trim();
    if (!messageId) throw new Error('message_id requis');

    let paymentMethod = request.paymentMethod || this.getPaymentMethod(scope);
    if (paymentMethod === 'ORANGE_CMR' || paymentMethod === 'ORANGE') {
      paymentMethod = 'OM_CMR';
    }

    const statusPath = this.getStatusPath(scope);

    const payload: Record<string, string> = {
      customerkey: customerKey,
      customersecret: customerSecret,
      message_id: messageId,
    };
    if (statusPath === '/webpayment/status') {
      payload.payment_method = paymentMethod;
    }

    const baseUrl = this.getApiBase(scope);
    return this.fetchJsonWithFreshToken(
      baseUrl,
      statusPath,
      (token) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
      scope,
    );
  }

  private getLegacyOrangePaymentConfig(requireMerchantDetails = true) {
    const xAuthToken = String(
      process.env.PAYNOTE_ORANGE_X_AUTH_TOKEN || '',
    ).trim();
    const channelUserMsisdn = String(
      process.env.PAYNOTE_ORANGE_CHANNEL_USER_MSISDN || '',
    ).trim();
    const pin = String(process.env.PAYNOTE_ORANGE_PIN || '').trim();
    const missing: string[] = [];

    if (!xAuthToken) missing.push('PAYNOTE_ORANGE_X_AUTH_TOKEN');
    if (requireMerchantDetails && !channelUserMsisdn) {
      missing.push('PAYNOTE_ORANGE_CHANNEL_USER_MSISDN');
    }
    if (requireMerchantDetails && !pin) {
      missing.push('PAYNOTE_ORANGE_PIN');
    }
    if (missing.length) {
      throw new PaynoteInvalidCredentialsError(
        `[CLE_INVALIDE] Configuration ancienne API Orange incomplete: ${missing.join(', ')}`,
        400,
        'orange:legacy_config',
        { code: 'MISSING_LEGACY_CONFIG', message: missing.join(', ') },
        'legacy_merchant',
      );
    }
    if (requireMerchantDetails && !/^\+?\d{9,15}$/.test(channelUserMsisdn)) {
      throw new PaynoteInvalidPaymentError(
        'PAYNOTE_ORANGE_CHANNEL_USER_MSISDN doit etre le numero marchand exact fourni par Paynote.',
        400,
        'orange:legacy_config',
        { code: 'INVALID_MERCHANT_MSISDN' },
        'INVALID_SUBSCRIBER',
      );
    }

    return {
      baseUrl: this.getLegacyOrangeBaseUrl(),
      xAuthToken,
      channelUserMsisdn,
      pin,
    };
  }

  private async legacyOrangePay(
    request: OrangePayRequest,
  ): Promise<Record<string, any>> {
    const config = this.getLegacyOrangePaymentConfig();
    const rawNotifUrl = request.notifUrl || this.getNotifUrl('orange');
    if (!rawNotifUrl) throw new Error('PAYNOTE_NOTIF_URL manquant');

    const notifUrl = this.validateNotifUrl(rawNotifUrl);
    const amount = this.validateAmount(request.amount, 'orange');
    const subscriberMsisdn = this.normalizeSubscriberMsisdn(
      request.subscriberMsisdn,
    );

    const initResponse = await this.fetchJsonWithFreshToken(
      config.baseUrl,
      '/omcoreapis/1.0.2/mp/init',
      (token) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-AUTH-TOKEN': config.xAuthToken,
        },
      }),
      'orange',
    );
    this.assertLegacyOrangeAuthentication(initResponse, 'orange:init');
    const payToken = this.findStringField(initResponse, ['payToken']);
    if (!payToken) {
      throw new Error(
        "Ancienne API Orange: aucun payToken retourne lors de l'initialisation",
      );
    }

    const paymentResponse = await this.fetchJsonWithFreshToken(
      config.baseUrl,
      '/omcoreapis/1.0.2/mp/pay',
      (token) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-AUTH-TOKEN': config.xAuthToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          notifUrl,
          channelUserMsisdn: config.channelUserMsisdn,
          amount,
          subscriberMsisdn,
          pin: config.pin,
          orderId: String(request.orderId || '').trim(),
          description: String(request.description || '').trim(),
          payToken,
        }),
      }),
      'orange',
    );
    this.assertLegacyOrangeAuthentication(paymentResponse, 'orange:pay');

    // Expose aussi le payToken au premier niveau pour garantir sa sauvegarde
    // avant le polling et permettre une reprise asynchrone fiable.
    return { ...paymentResponse, payToken };
  }

  private async legacyOrangePaymentStatus(
    request: OrangeStatusRequest,
  ): Promise<Record<string, any>> {
    const config = this.getLegacyOrangePaymentConfig(false);
    const payToken = String(request.messageId || '').trim();
    if (!payToken) throw new Error('payToken Orange requis');

    const statusResponse = await this.fetchJsonWithFreshToken(
      config.baseUrl,
      `/omcoreapis/1.0.2/mp/paymentstatus/${encodeURIComponent(payToken)}`,
      (token) => ({
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-AUTH-TOKEN': config.xAuthToken,
        },
      }),
      'orange',
    );
    this.assertLegacyOrangeAuthentication(statusResponse, 'orange:status');
    return statusResponse;
  }

  async orangePay(request: OrangePayRequest): Promise<Record<string, any>> {
    if (this.usesLegacyOrangeApi()) {
      return this.legacyOrangePay(request);
    }
    return this.mutualizedPay(
      { ...request, paymentMethod: this.getPaymentMethod('orange') },
      'orange',
    );
  }

  async orangePaymentStatus(
    request: OrangeStatusRequest,
  ): Promise<Record<string, any>> {
    if (this.usesLegacyOrangeApi()) {
      return this.legacyOrangePaymentStatus(request);
    }
    return this.mutualizedPaymentStatus(
      { ...request, paymentMethod: this.getPaymentMethod('orange') },
      'orange',
    );
  }

  async mtnPay(request: MtnPayRequest): Promise<Record<string, any>> {
    return this.mutualizedPay(
      {
        ...request,
        paymentMethod: request.paymentMethod || this.getPaymentMethod('mtn'),
      },
      'mtn',
    );
  }

  async mtnPaymentStatus(
    request: MtnStatusRequest,
  ): Promise<Record<string, any>> {
    return this.mutualizedPaymentStatus(
      {
        ...request,
        paymentMethod: request.paymentMethod || this.getPaymentMethod('mtn'),
      },
      'mtn',
    );
  }
}
