import { Injectable } from '@nestjs/common';

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

export class PaynoteProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly operation: string,
    readonly fault: ProviderFault,
  ) {
    super(message);
    this.name = 'PaynoteProviderError';
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
      process.env.PAYNOTE_ORANGE_LEGACY_BASE_URL || 'https://api-s1.orange.cm',
    )
      .trim()
      .replace(/\/+$/, '');

    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('PAYNOTE_ORANGE_LEGACY_BASE_URL invalide');
    }
    if (url.protocol !== 'https:') {
      throw new Error('PAYNOTE_ORANGE_LEGACY_BASE_URL doit utiliser HTTPS');
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
        key:
          process.env.PAYNOTE_ORANGE_LEGACY_CUSTOMER_KEY ||
          process.env.PAYNOTE_ORANGE_CUSTOMER_KEY ||
          '',
        secret:
          process.env.PAYNOTE_ORANGE_LEGACY_CUSTOMER_SECRET ||
          process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET ||
          '',
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
            ? 'PAYNOTE_ORANGE_LEGACY_CUSTOMER_KEY/SECRET ou PAYNOTE_ORANGE_CUSTOMER_KEY/SECRET'
            : 'PAYNOTE_ORANGE_TOKEN_CLIENT_ID/SECRET'
          : scope === 'mtn'
            ? 'PAYNOTE_MTN_TOKEN_CLIENT_ID/SECRET'
            : 'PAYNOTE_CLIENT_ID/SECRET';
      throw new Error(
        `Identifiants OAuth2 Paynote manquants (${credentialPrefix})`,
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
        throw this.providerError(`token:${scope}`, res.status, text);
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
        throw new Error(
          `Paynote token timeout (${params.tokenUrl}) apres ${timeoutMs}ms`,
        );
      }
      if (error instanceof PaynoteProviderError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'erreur inconnue';
      throw new Error(
        `Paynote token fetch failed (${params.tokenUrl}): ${message}`,
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
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw this.providerError(path, res.status, text);
      }
      const payload: unknown = await res.json().catch(() => ({}));
      return payload && typeof payload === 'object'
        ? (payload as Record<string, unknown>)
        : {};
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Paynote timeout (${baseUrl}${path}) apres ${timeoutMs}ms`,
        );
      }
      if (error instanceof PaynoteProviderError) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'erreur inconnue';
      throw new Error(`Paynote fetch failed (${baseUrl}${path}): ${message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  private providerError(
    operation: string,
    status: number,
    rawBody: string,
  ): PaynoteProviderError {
    const fault = this.extractProviderFault(rawBody);
    const code = String(fault.code || '').trim();
    const message = String(fault.message || '').trim();
    const description = String(fault.description || '').trim();

    if (status === 401 || code === '900901') {
      const isLegacyOrange =
        this.usesLegacyOrangeApi() &&
        (operation === 'token:orange' || operation.includes('/omcoreapis/'));
      const message = isLegacyOrange
        ? operation.startsWith('token:')
          ? "Authentification ancienne API Orange refusee. Verifiez l'ancienne CustomerKey et l'ancien CustomerSecret fournis par Paynote."
          : "Authentification ancienne API Orange refusee. Verifiez le X-AUTH-TOKEN et l'acces marchand fournis par Paynote."
        : operation.startsWith('token:')
          ? 'Authentification Paynote refusee lors de la generation du jeton. Verifiez le ClientId et le ClientSecret du nouvel acces OAuth2 de cet operateur.'
          : 'Authentification Paynote refusee lors de la requete de paiement. Verifiez les nouvelles valeurs CustomerKey et CustomerSecret de cet operateur.';
      return new PaynoteProviderError(message, status, operation, fault);
    }

    if (code === '900902') {
      return new PaynoteProviderError(
        'Identifiants Paynote manquants. Verifiez le header Authorization.',
        status,
        operation,
        fault,
      );
    }

    const suffix = code
      ? ` Code fournisseur: ${code}.`
      : message || description
        ? ` Detail fournisseur: ${message || description}.`
        : '';

    return new PaynoteProviderError(
      `Service Paynote indisponible (HTTP ${status}).${suffix}`,
      status,
      operation,
      fault,
    );
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

  private isInvalidTokenError(error: unknown): boolean {
    if (!(error instanceof PaynoteProviderError)) return false;
    const code = String(error.fault.code || '').trim();
    return error.status === 401 || code === '900901' || code === '900902';
  }

  private getPaymentMethod(scope: PaynoteScope) {
    if (scope === 'orange') {
      return process.env.PAYNOTE_ORANGE_PAYMENT_METHOD || 'OM_CMR';
    }
    if (scope === 'mtn') {
      return process.env.PAYNOTE_MTN_PAYMENT_METHOD || 'MTN_CMR';
    }
    return process.env.PAYNOTE_PAYMENT_METHOD || 'OM_CMR';
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
      throw new Error(
        'Numero de paiement invalide. Utilisez un numero camerounais de 9 chiffres commencant par 6.',
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
      throw new Error(
        `Montant Paynote invalide. Le montant doit etre un entier compris entre ${min} et ${max} XAF.`,
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

    if (!customerKey) throw new Error('PAYNOTE_CUSTOMER_KEY manquant');
    if (!customerSecret) throw new Error('PAYNOTE_CUSTOMER_SECRET manquant');
    if (!rawNotifUrl) throw new Error('PAYNOTE_NOTIF_URL manquant');

    const notifUrl = this.validateNotifUrl(rawNotifUrl);
    const amount = this.validateAmount(request.amount, scope);
    const subscriberMsisdn = this.normalizeSubscriberMsisdn(
      request.subscriberMsisdn,
    );

    const paymentMethod = request.paymentMethod || this.getPaymentMethod(scope);

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

    if (!customerKey) throw new Error('PAYNOTE_CUSTOMER_KEY manquant');
    if (!customerSecret) throw new Error('PAYNOTE_CUSTOMER_SECRET manquant');

    const messageId = String(request.messageId || '').trim();
    if (!messageId) throw new Error('message_id requis');

    const paymentMethod = request.paymentMethod || this.getPaymentMethod(scope);

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
      process.env.PAYNOTE_ORANGE_LEGACY_X_AUTH_TOKEN || '',
    ).trim();
    const channelUserMsisdn = String(
      process.env.PAYNOTE_ORANGE_LEGACY_CHANNEL_USER_MSISDN || '',
    )
      .replace(/\D/g, '')
      .replace(/^237/, '');
    const pin = String(process.env.PAYNOTE_ORANGE_LEGACY_PIN || '').trim();
    const missing: string[] = [];

    if (!xAuthToken) missing.push('PAYNOTE_ORANGE_LEGACY_X_AUTH_TOKEN');
    if (requireMerchantDetails && !channelUserMsisdn) {
      missing.push('PAYNOTE_ORANGE_LEGACY_CHANNEL_USER_MSISDN');
    }
    if (requireMerchantDetails && !pin) {
      missing.push('PAYNOTE_ORANGE_LEGACY_PIN');
    }
    if (missing.length) {
      throw new Error(
        `Configuration ancienne API Orange incomplete: ${missing.join(', ')}`,
      );
    }
    if (requireMerchantDetails && !/^6\d{8}$/.test(channelUserMsisdn)) {
      throw new Error(
        'PAYNOTE_ORANGE_LEGACY_CHANNEL_USER_MSISDN doit contenir un numero camerounais de 9 chiffres sans indicatif.',
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

    return this.fetchJsonWithFreshToken(
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
