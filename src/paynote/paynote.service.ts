import { Injectable } from '@nestjs/common';

type TokenResponse = {
  access_token: string;
  token_type?: string;
  scope?: string;
  expires_in: number;
};

type InitPaymentResponse = {
  message?: string;
  data?: { payToken?: string };
};

type PayRequest = {
  channelUserMsisdn?: string;
  pin?: string;
  notifUrl?: string;
  amount: string | number;
  subscriberMsisdn: string;
  orderId: string;
  description: string;
  payToken: string;
};

type PaymentStatusResponse = {
  message?: string;
  data?: Record<string, any>;
};

type ProviderFault = {
  code?: string;
  message?: string;
  description?: string;
};

class PaynoteProviderError extends Error {
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

type MtnPayRequest = {
  subscriberMsisdn: string;
  orderId: string;
  amount: string | number;
  description: string;
  notifUrl?: string;
  customerKey?: string;
  customerSecret?: string;
  paymentMethod?: string;
};

type MtnStatusRequest = {
  messageId: string;
  customerKey?: string;
  customerSecret?: string;
};

@Injectable()
export class PaynoteService {
  private orangeCachedToken: string | null = null;
  private orangeTokenExpiresAt = 0;
  private orangeTokenPromise: Promise<string> | null = null;

  private mutualizedCachedToken: string | null = null;
  private mutualizedTokenExpiresAt = 0;
  private mutualizedTokenPromise: Promise<string> | null = null;

  private getTokenUrl() {
    return (
      process.env.PAYNOTE_ORANGE_TOKEN_URL || 'https://api-s1.orange.cm/token'
    );
  }

  private getCredentials() {
    const key = process.env.PAYNOTE_ORANGE_CUSTOMER_KEY || '';
    const secret = process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET || '';
    return { key, secret };
  }

  private getTimeoutMs() {
    const raw = Number(
      process.env.PAYNOTE_TIMEOUT_MS ||
        process.env.PAYNOTE_ORANGE_TIMEOUT_MS ||
        90000,
    );
    return Number.isFinite(raw) && raw > 0 ? raw : 90000;
  }

  private getApiBase() {
    return process.env.PAYNOTE_ORANGE_API_BASE || 'https://api-s1.orange.cm';
  }

  private getMtnApiBase() {
    return (
      process.env.PAYNOTE_MTN_API_BASE || 'https://omapi.ynote.africa/prod'
    );
  }

  private getMutualizedTokenUrl() {
    return (
      process.env.PAYNOTE_MTN_TOKEN_URL ||
      process.env.PAYNOTE_MUTUALIZED_TOKEN_URL ||
      'https://omapi-token.ynote.africa/oauth2/token'
    );
  }

  private getMutualizedCredentials() {
    const key =
      process.env.PAYNOTE_MTN_TOKEN_CLIENT_ID ||
      process.env.PAYNOTE_MUTUALIZED_CLIENT_ID ||
      process.env.PAYNOTE_MTN_CUSTOMER_KEY ||
      '';
    const secret =
      process.env.PAYNOTE_MTN_TOKEN_CLIENT_SECRET ||
      process.env.PAYNOTE_MUTUALIZED_CLIENT_SECRET ||
      process.env.PAYNOTE_MTN_CUSTOMER_SECRET ||
      '';
    return { key, secret };
  }

  private getXAuthToken() {
    return process.env.PAYNOTE_ORANGE_X_AUTH_TOKEN || '';
  }

  private getChannelMsisdn() {
    return process.env.PAYNOTE_ORANGE_CHANNEL_MSISDN || '';
  }

  private getChannelPin() {
    return process.env.PAYNOTE_ORANGE_PIN || '';
  }

  private getNotifUrl() {
    return process.env.PAYNOTE_ORANGE_NOTIF_URL || '';
  }

  private getMtnCustomerKey() {
    return process.env.PAYNOTE_MTN_CUSTOMER_KEY || '';
  }

  private getMtnCustomerSecret() {
    return process.env.PAYNOTE_MTN_CUSTOMER_SECRET || '';
  }

  private getMtnNotifUrl() {
    return process.env.PAYNOTE_MTN_NOTIF_URL || '';
  }

  private isOrangeTokenValid() {
    return this.orangeCachedToken && Date.now() < this.orangeTokenExpiresAt;
  }

  private isMutualizedTokenValid() {
    return (
      this.mutualizedCachedToken && Date.now() < this.mutualizedTokenExpiresAt
    );
  }

  async getOrangeAccessToken(): Promise<string> {
    if (this.isOrangeTokenValid()) return this.orangeCachedToken as string;
    if (this.orangeTokenPromise) return this.orangeTokenPromise;
    this.orangeTokenPromise = this.fetchAccessToken({
      tokenUrl: this.getTokenUrl(),
      credentials: this.getCredentials(),
      cache: 'orange',
    }).finally(() => {
      this.orangeTokenPromise = null;
    });
    return this.orangeTokenPromise;
  }

  private clearOrangeAccessToken() {
    this.orangeCachedToken = null;
    this.orangeTokenExpiresAt = 0;
    this.orangeTokenPromise = null;
  }

  async getMutualizedAccessToken(): Promise<string> {
    if (this.isMutualizedTokenValid())
      return this.mutualizedCachedToken as string;
    if (this.mutualizedTokenPromise) return this.mutualizedTokenPromise;
    this.mutualizedTokenPromise = this.fetchAccessToken({
      tokenUrl: this.getMutualizedTokenUrl(),
      credentials: this.getMutualizedCredentials(),
      cache: 'mutualized',
    }).finally(() => {
      this.mutualizedTokenPromise = null;
    });
    return this.mutualizedTokenPromise;
  }

  private async fetchAccessToken(params: {
    tokenUrl: string;
    credentials: { key: string; secret: string };
    cache: 'orange' | 'mutualized';
  }): Promise<string> {
    const { key, secret } = params.credentials;
    if (!key || !secret) {
      if (params.cache === 'orange') {
        throw new Error('PAYNOTE_ORANGE_CUSTOMER_KEY/SECRET manquants');
      }
      throw new Error(
        'PAYNOTE_MTN_TOKEN_CLIENT_ID/SECRET manquants (ou fallback PAYNOTE_MTN_CUSTOMER_KEY/SECRET)',
      );
    }

    const auth = Buffer.from(`${key}:${secret}`, 'utf8').toString('base64');
    const formData = new URLSearchParams();
    formData.set('grant_type', 'client_credentials');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

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
      const ttlMs = Math.max(
        Number(data.expires_in || 0) * 1000 - 30_000,
        60_000,
      );
      if (params.cache === 'orange') {
        this.orangeCachedToken = data.access_token;
        this.orangeTokenExpiresAt = Date.now() + ttlMs;
      } else {
        this.mutualizedCachedToken = data.access_token;
        this.mutualizedTokenExpiresAt = Date.now() + ttlMs;
      }
      return data.access_token;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Paynote token timeout (${params.tokenUrl}) apres ${this.getTimeoutMs()}ms`,
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

  private async fetchJson(path: string, init: RequestInit) {
    return this.fetchJsonFrom(this.getApiBase(), path, init);
  }

  private async fetchOrangeJsonWithFreshToken(
    path: string,
    buildInit: (token: string, xAuth: string) => RequestInit,
  ) {
    const xAuth = this.getXAuthToken();
    if (!xAuth) throw new Error('PAYNOTE_ORANGE_X_AUTH_TOKEN manquant');

    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.getOrangeAccessToken();
      try {
        return await this.fetchJson(path, buildInit(token, xAuth));
      } catch (error) {
        if (attempt === 0 && this.isInvalidOrangeTokenError(error)) {
          this.clearOrangeAccessToken();
          continue;
        }
        throw error;
      }
    }

    throw new Error('Paynote Orange retry epuise');
  }

  private async fetchJsonFrom(
    baseUrl: string,
    path: string,
    init: RequestInit,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());
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
      return res.json().catch(() => ({}));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Paynote timeout (${baseUrl}${path}) apres ${this.getTimeoutMs()}ms`,
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
        'Configuration Paynote/Orange invalide ou jeton expire. Verifiez customerKey/customerSecret, X-AUTH-TOKEN et environnement Orange.',
        status,
        operation,
        fault,
      );
    }

    if (code === '900902') {
      return new PaynoteProviderError(
        'Identifiants Paynote/Orange manquants. Verifiez les headers Authorization et X-AUTH-TOKEN.',
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
      `Service Paynote/Orange indisponible (HTTP ${status}).${suffix}`,
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
      code: this.stringValue(source.code),
      message: this.stringValue(source.message),
      description: this.stringValue(source.description),
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

  private isInvalidOrangeTokenError(error: unknown): boolean {
    if (!(error instanceof PaynoteProviderError)) return false;
    const code = String(error.fault.code || '').trim();
    return error.status === 401 || code === '900901' || code === '900902';
  }

  async initPayment(): Promise<InitPaymentResponse> {
    return this.fetchOrangeJsonWithFreshToken(
      '/omcoreapis/1.0.2/mp/init',
      (token, xAuth) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-AUTH-TOKEN': xAuth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }),
    ) as Promise<InitPaymentResponse>;
  }

  async pay(request: PayRequest): Promise<PaymentStatusResponse> {
    const channelUserMsisdn =
      request.channelUserMsisdn || this.getChannelMsisdn();
    const pin = request.pin || this.getChannelPin();
    const notifUrl = request.notifUrl || this.getNotifUrl();
    if (!channelUserMsisdn)
      throw new Error('PAYNOTE_ORANGE_CHANNEL_MSISDN manquant');
    if (!pin) throw new Error('PAYNOTE_ORANGE_PIN manquant');
    if (!notifUrl) throw new Error('PAYNOTE_ORANGE_NOTIF_URL manquant');

    const payload = {
      notifUrl,
      channelUserMsisdn,
      amount: String(request.amount),
      subscriberMsisdn: request.subscriberMsisdn,
      pin,
      orderId: request.orderId,
      description: request.description,
      payToken: request.payToken,
    };

    return this.fetchOrangeJsonWithFreshToken(
      '/omcoreapis/1.0.2/mp/pay',
      (token, xAuth) => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-AUTH-TOKEN': xAuth,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }),
    ) as Promise<PaymentStatusResponse>;
  }

  async getPaymentStatus(payToken: string): Promise<PaymentStatusResponse> {
    const safeToken = encodeURIComponent(String(payToken || '').trim());
    if (!safeToken) throw new Error('payToken requis');
    return this.fetchOrangeJsonWithFreshToken(
      `/omcoreapis/1.0.2/mp/paymentstatus/${safeToken}`,
      (token, xAuth) => ({
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-AUTH-TOKEN': xAuth,
        },
      }),
    ) as Promise<PaymentStatusResponse>;
  }

  async mtnPay(request: MtnPayRequest): Promise<Record<string, any>> {
    const token = await this.getMutualizedAccessToken();
    const customerKey = request.customerKey || this.getMtnCustomerKey();
    const customerSecret =
      request.customerSecret || this.getMtnCustomerSecret();
    const notifUrl = request.notifUrl || this.getMtnNotifUrl();
    if (!customerKey) throw new Error('PAYNOTE_MTN_CUSTOMER_KEY manquant');
    if (!customerSecret)
      throw new Error('PAYNOTE_MTN_CUSTOMER_SECRET manquant');
    if (!notifUrl) throw new Error('PAYNOTE_MTN_NOTIF_URL manquant');

    const payload = {
      API_MUT: {
        customerkey: customerKey,
        customersecret: customerSecret,
        order_id: request.orderId,
        description: request.description,
        amount: String(request.amount),
        subscriberMsisdn: request.subscriberMsisdn,
        notifUrl,
        PaiementMethod: request.paymentMethod || 'MTN_CMR',
      },
    };

    return this.fetchJsonFrom(this.getMtnApiBase(), '/webpayment', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  async mtnPaymentStatus(
    request: MtnStatusRequest,
  ): Promise<Record<string, any>> {
    const token = await this.getMutualizedAccessToken();
    const customerKey = request.customerKey || this.getMtnCustomerKey();
    const customerSecret =
      request.customerSecret || this.getMtnCustomerSecret();
    if (!customerKey) throw new Error('PAYNOTE_MTN_CUSTOMER_KEY manquant');
    if (!customerSecret)
      throw new Error('PAYNOTE_MTN_CUSTOMER_SECRET manquant');
    const messageId = String(request.messageId || '').trim();
    if (!messageId) throw new Error('message_id requis');

    const payload = {
      customerkey: customerKey,
      customersecret: customerSecret,
      message_id: messageId,
    };

    return this.fetchJsonFrom(this.getMtnApiBase(), '/webpaymentmtn/status', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }
}
