import { PaynoteService } from './paynote.service';

const originalFetch = global.fetch;
const originalEnv = process.env;

function tokenResponse(accessToken: string): Partial<Response> {
  return {
    ok: true,
    json: async () => ({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600,
    }),
  };
}

function unauthorizedFaultResponse(): Partial<Response> {
  return {
    ok: false,
    status: 401,
    text: async () =>
      JSON.stringify({
        fault: {
          code: '900901',
          message: 'Invalid Credentials',
          description: 'Access failure for API: /webpayment',
        },
      }),
  };
}

describe('PaynoteService', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PAYNOTE_CLIENT_ID: 'test-client-id',
      PAYNOTE_CLIENT_SECRET: 'test-client-secret',
      PAYNOTE_CUSTOMER_KEY: 'test-customer-key',
      PAYNOTE_CUSTOMER_SECRET: 'test-customer-secret',
      PAYNOTE_NOTIF_URL: 'https://mysite.com/notif',
      PAYNOTE_WEBHOOK_SECRET: 'test-webhook-secret',
      PAYNOTE_TOKEN_URL: 'https://omapi-token.ynote.africa/oauth2/token',
      PAYNOTE_API_BASE: 'https://omapi.ynote.africa/prod',
      PAYNOTE_TIMEOUT_MS: '1000',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('performs Orange Money payment via unified API_MUT endpoint', async () => {
    const service = new PaynoteService();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('test-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          StatusCode: 200,
          body: 'Pay Request Accepted',
          ErrorMessage: '',
          parameters: {
            operation: 'OM_CMR collection ussd-mut',
            MessageId: 'MP250000123',
            currency: 'XAF',
            amount: '1000',
            subscriberMsisdn: '692000000',
            order_id: 'ORD-001',
            notifUrl: 'https://mysite.com/notif',
          },
        }),
      }) as unknown as typeof fetch;

    const result = await service.orangePay({
      amount: 1000,
      subscriberMsisdn: '692000000',
      orderId: 'ORD-001',
      description: 'Paiement test OM',
    });

    expect(result).toMatchObject({
      StatusCode: 200,
      parameters: {
        MessageId: 'MP250000123',
      },
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toBe('https://omapi-token.ynote.africa/oauth2/token');
    expect(calls[1][0]).toBe('https://omapi.ynote.africa/prod/webpayment');

    const paymentBody = JSON.parse(calls[1][1].body);
    expect(paymentBody.API_MUT).toMatchObject({
      customerkey: 'test-customer-key',
      customersecret: 'test-customer-secret',
      order_id: 'ORD-001',
      amount: '1000',
      subscriberMsisdn: '692000000',
      description: 'Paiement test OM',
      PaiementMethod: 'OM_CMR',
      notifUrl: 'https://mysite.com/notif?token=test-webhook-secret',
    });
    expect(calls[1][1].headers.Authorization).toBe('Bearer test-token');
  });

  it('checks Orange Money payment status on /webpayment/status', async () => {
    const service = new PaynoteService();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('test-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ErrorCode: 200,
          body: 'Pay Request Accepted',
          parameters: {
            status: 'SUCCESSFUL',
            paytoken: 'MP250000123',
            amount: '1000',
          },
        }),
      }) as unknown as typeof fetch;

    const result = await service.orangePaymentStatus({
      messageId: 'MP250000123',
    });

    expect(result).toMatchObject({
      ErrorCode: 200,
      parameters: {
        status: 'SUCCESSFUL',
      },
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][0]).toBe(
      'https://omapi.ynote.africa/prod/webpayment/status',
    );

    const statusBody = JSON.parse(calls[1][1].body);
    expect(statusBody).toMatchObject({
      customerkey: 'test-customer-key',
      customersecret: 'test-customer-secret',
      message_id: 'MP250000123',
      payment_method: 'OM_CMR',
    });
  });

  it('refreshes expired token and retries once on 401 response', async () => {
    const service = new PaynoteService();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('expired-token'))
      .mockResolvedValueOnce(unauthorizedFaultResponse())
      .mockResolvedValueOnce(tokenResponse('refreshed-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          StatusCode: 200,
          parameters: { MessageId: 'MP250000123' },
        }),
      }) as unknown as typeof fetch;

    const result = await service.orangePay({
      amount: 500,
      subscriberMsisdn: '692000000',
      orderId: 'ORD-002',
      description: 'Test retry',
    });

    expect(result).toMatchObject({
      StatusCode: 200,
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][1].headers.Authorization).toBe('Bearer expired-token');
    expect(calls[3][1].headers.Authorization).toBe('Bearer refreshed-token');
  });

  it('handles token endpoint authentication errors cleanly', async () => {
    const service = new PaynoteService();

    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () =>
        '{"fault":{"code":"900901","message":"Invalid Credentials"}}',
    }) as unknown as typeof fetch;

    await expect(service.getAccessToken()).rejects.toMatchObject({
      message: expect.stringContaining(
        'Configuration Paynote invalide ou jeton expire',
      ),
    });
  });

  it('performs MTN payment with ORANGE/MTN backward compatible envs', async () => {
    const service = new PaynoteService();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('mtn-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ErrorCode: 200,
          parameters: { MessageId: 'MTN-MSG-123' },
        }),
      }) as unknown as typeof fetch;

    const result = await service.mtnPay({
      amount: 2000,
      subscriberMsisdn: '670000000',
      orderId: 'ORD-MTN-01',
      description: 'Paiement MTN',
    });

    expect(result).toMatchObject({
      ErrorCode: 200,
      parameters: { MessageId: 'MTN-MSG-123' },
    });
  });

  it('checks MTN status on the dedicated endpoint without Orange fields', async () => {
    const service = new PaynoteService();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('mtn-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ErrorCode: 200,
          parameters: { status: 'SUCCESSFUL', amount: '2000' },
        }),
      }) as unknown as typeof fetch;

    await service.mtnPaymentStatus({ messageId: 'MTN-MSG-123' });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][0]).toBe(
      'https://omapi.ynote.africa/prod/webpaymentmtn/status',
    );
    expect(JSON.parse(calls[1][1].body)).toEqual({
      customerkey: 'test-customer-key',
      customersecret: 'test-customer-secret',
      message_id: 'MTN-MSG-123',
    });
  });

  it('keeps Orange and MTN access tokens separated', async () => {
    delete process.env.PAYNOTE_CLIENT_ID;
    delete process.env.PAYNOTE_CLIENT_SECRET;
    process.env.PAYNOTE_ORANGE_CUSTOMER_KEY = 'orange-key';
    process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET = 'orange-secret';
    process.env.PAYNOTE_MTN_TOKEN_CLIENT_ID = 'mtn-key';
    process.env.PAYNOTE_MTN_TOKEN_CLIENT_SECRET = 'mtn-secret';
    const service = new PaynoteService();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('orange-token'))
      .mockResolvedValueOnce(
        tokenResponse('mtn-token'),
      ) as unknown as typeof fetch;

    await expect(service.getOrangeAccessToken()).resolves.toBe('orange-token');
    await expect(service.getMutualizedAccessToken()).resolves.toBe('mtn-token');

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
