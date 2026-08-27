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

  private getTokenUrl(scope?: PaynoteScope) {
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
    const key =
      process.env.PAYNOTE_CLIENT_ID ||
      process.env.PAYNOTE_CUSTOMER_KEY ||
      (scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_CUSTOMER_KEY
        : undefined) ||
      (scope === 'mtn'
        ? process.env.PAYNOTE_MTN_TOKEN_CLIENT_ID ||
          process.env.PAYNOTE_MTN_CUSTOMER_KEY
        : undefined) ||
      process.env.PAYNOTE_MUTUALIZED_CLIENT_ID ||
      process.env.PAYNOTE_MTN_TOKEN_CLIENT_ID ||
      process.env.PAYNOTE_ORANGE_CUSTOMER_KEY ||
      process.env.PAYNOTE_MTN_CUSTOMER_KEY ||
      '';

    const secret =
      process.env.PAYNOTE_CLIENT_SECRET ||
      process.env.PAYNOTE_CUSTOMER_SECRET ||
      (scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET
        : undefined) ||
      (scope === 'mtn'
        ? process.env.PAYNOTE_MTN_TOKEN_CLIENT_SECRET ||
          process.env.PAYNOTE_MTN_CUSTOMER_SECRET
        : undefined) ||
      process.env.PAYNOTE_MUTUALIZED_CLIENT_SECRET ||
      process.env.PAYNOTE_MTN_TOKEN_CLIENT_SECRET ||
      process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET ||
      process.env.PAYNOTE_MTN_CUSTOMER_SECRET ||
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
      process.env.PAYNOTE_CUSTOMER_KEY ||
      process.env.PAYNOTE_CLIENT_ID ||
      (scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_CUSTOMER_KEY
        : undefined) ||
      (scope === 'mtn' ? process.env.PAYNOTE_MTN_CUSTOMER_KEY : undefined) ||
      process.env.PAYNOTE_ORANGE_CUSTOMER_KEY ||
      process.env.PAYNOTE_MTN_CUSTOMER_KEY ||
      ''
    );
  }

  private getCustomerSecret(scope?: PaynoteScope) {
    return (
      process.env.PAYNOTE_CUSTOMER_SECRET ||
      process.env.PAYNOTE_CLIENT_SECRET ||
      (scope === 'orange'
        ? process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET
        : undefined) ||
      (scope === 'mtn' ? process.env.PAYNOTE_MTN_CUSTOMER_SECRET : undefined) ||
      process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET ||
      process.env.PAYNOTE_MTN_CUSTOMER_SECRET ||
      ''
    );
  }

  private getNotifUrl(scope?: PaynoteScope) {
    return (
      process.env.PAYNOTE_NOTIF_URL ||
      (scope === 'orange' ? process.env.PAYNOTE_ORANGE_NOTIF_URL : undefined) ||
      (scope === 'mtn' ? process.env.PAYNOTE_MTN_NOTIF_URL : undefined) ||
      process.env.PAYNOTE_ORANGE_NOTIF_URL ||
      process.env.PAYNOTE_MTN_NOTIF_URL ||
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
      throw new Error(
        'Identifiants Paynote manquants (PAYNOTE_CLIENT_ID/SECRET ou PAYNOTE_CUSTOMER_KEY/SECRET)',
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
        throw this.providerError('token', res.status, text);
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
      return new PaynoteProviderError(
        'Configuration Paynote invalide ou jeton expire. Verifiez vos identifiants ClientId/ClientSecret ou CustomerKey/CustomerSecret.',
        status,
        operation,
        fault,
      );
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

  async orangePay(request: OrangePayRequest): Promise<Record<string, any>> {
    return this.mutualizedPay(
      { ...request, paymentMethod: this.getPaymentMethod('orange') },
      'orange',
    );
  }

  async orangePaymentStatus(
    request: OrangeStatusRequest,
  ): Promise<Record<string, any>> {
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
