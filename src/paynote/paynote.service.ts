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
  private cachedToken: string | null = null;
  private tokenExpiresAt = 0;
  private tokenPromise: Promise<string> | null = null;

  private getTokenUrl() {
    return process.env.PAYNOTE_ORANGE_TOKEN_URL || 'https://api-s1.orange.cm/token';
  }

  private getCredentials() {
    const key = process.env.PAYNOTE_ORANGE_CUSTOMER_KEY || '';
    const secret = process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET || '';
    return { key, secret };
  }

  private getTimeoutMs() {
    const raw = Number(process.env.PAYNOTE_ORANGE_TIMEOUT_MS || 15000);
    return Number.isFinite(raw) && raw > 0 ? raw : 15000;
  }

  private getApiBase() {
    return process.env.PAYNOTE_ORANGE_API_BASE || 'https://api-s1.orange.cm';
  }

  private getMtnApiBase() {
    return process.env.PAYNOTE_MTN_API_BASE || 'https://omapi.ynote.africa/prod';
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

  private isTokenValid() {
    return this.cachedToken && Date.now() < this.tokenExpiresAt;
  }

  async getAccessToken(): Promise<string> {
    if (this.isTokenValid()) return this.cachedToken as string;
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise = this.fetchAccessToken().finally(() => {
      this.tokenPromise = null;
    });
    return this.tokenPromise;
  }

  private async fetchAccessToken(): Promise<string> {
    const { key, secret } = this.getCredentials();
    if (!key || !secret) {
      throw new Error('PAYNOTE_ORANGE_CUSTOMER_KEY/SECRET manquants');
    }

    const auth = Buffer.from(`${key}:${secret}`, 'utf8').toString('base64');
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());

    try {
      const res = await fetch(this.getTokenUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: params.toString(),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Paynote token error ${res.status}: ${text}`);
      }
      const data = (await res.json()) as TokenResponse;
      if (!data?.access_token) {
        throw new Error('Paynote token response invalide');
      }
      const ttlMs = Math.max(Number(data.expires_in || 0) * 1000 - 30_000, 60_000);
      this.cachedToken = data.access_token;
      this.tokenExpiresAt = Date.now() + ttlMs;
      return data.access_token;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchJson(path: string, init: RequestInit) {
    return this.fetchJsonFrom(this.getApiBase(), path, init);
  }

  private async fetchJsonFrom(baseUrl: string, path: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.getTimeoutMs());
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Paynote error ${res.status}: ${text}`);
      }
      return res.json().catch(() => ({}));
    } finally {
      clearTimeout(timeout);
    }
  }

  async initPayment(): Promise<InitPaymentResponse> {
    const token = await this.getAccessToken();
    const xAuth = this.getXAuthToken();
    if (!xAuth) throw new Error('PAYNOTE_ORANGE_X_AUTH_TOKEN manquant');
    return this.fetchJson('/omcoreapis/1.0.2/mp/init', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': xAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  }

  async pay(request: PayRequest): Promise<PaymentStatusResponse> {
    const token = await this.getAccessToken();
    const xAuth = this.getXAuthToken();
    if (!xAuth) throw new Error('PAYNOTE_ORANGE_X_AUTH_TOKEN manquant');

    const channelUserMsisdn = request.channelUserMsisdn || this.getChannelMsisdn();
    const pin = request.pin || this.getChannelPin();
    const notifUrl = request.notifUrl || this.getNotifUrl();
    if (!channelUserMsisdn) throw new Error('PAYNOTE_ORANGE_CHANNEL_MSISDN manquant');
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

    return this.fetchJson('/omcoreapis/1.0.2/mp/pay', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': xAuth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  async getPaymentStatus(payToken: string): Promise<PaymentStatusResponse> {
    const token = await this.getAccessToken();
    const xAuth = this.getXAuthToken();
    if (!xAuth) throw new Error('PAYNOTE_ORANGE_X_AUTH_TOKEN manquant');
    const safeToken = encodeURIComponent(String(payToken || '').trim());
    if (!safeToken) throw new Error('payToken requis');
    return this.fetchJson(`/omcoreapis/1.0.2/mp/paymentstatus/${safeToken}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-AUTH-TOKEN': xAuth,
      },
    });
  }

  async mtnPay(request: MtnPayRequest): Promise<Record<string, any>> {
    const token = await this.getAccessToken();
    const customerKey = request.customerKey || this.getMtnCustomerKey();
    const customerSecret = request.customerSecret || this.getMtnCustomerSecret();
    const notifUrl = request.notifUrl || this.getMtnNotifUrl();
    if (!customerKey) throw new Error('PAYNOTE_MTN_CUSTOMER_KEY manquant');
    if (!customerSecret) throw new Error('PAYNOTE_MTN_CUSTOMER_SECRET manquant');
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

  async mtnPaymentStatus(request: MtnStatusRequest): Promise<Record<string, any>> {
    const token = await this.getAccessToken();
    const customerKey = request.customerKey || this.getMtnCustomerKey();
    const customerSecret = request.customerSecret || this.getMtnCustomerSecret();
    if (!customerKey) throw new Error('PAYNOTE_MTN_CUSTOMER_KEY manquant');
    if (!customerSecret) throw new Error('PAYNOTE_MTN_CUSTOMER_SECRET manquant');
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
