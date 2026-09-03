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
      PAYNOTE_ORANGE_MODE: 'mutualized',
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
      message: expect.stringContaining('generation du jeton'),
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
    process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_ID = 'orange-client-id';
    process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_SECRET = 'orange-client-secret';
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
    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][1].headers.Authorization).toBe(
      `Basic ${Buffer.from('orange-client-id:orange-client-secret').toString('base64')}`,
    );
    expect(calls[1][1].headers.Authorization).toBe(
      `Basic ${Buffer.from('mtn-key:mtn-secret').toString('base64')}`,
    );
  });

  it('uses Orange-scoped credentials before generic Paynote credentials', async () => {
    process.env.PAYNOTE_CLIENT_ID = 'generic-client-id';
    process.env.PAYNOTE_CLIENT_SECRET = 'generic-client-secret';
    process.env.PAYNOTE_CUSTOMER_KEY = 'generic-customer-key';
    process.env.PAYNOTE_CUSTOMER_SECRET = 'generic-customer-secret';
    process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_ID = 'orange-client-id';
    process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_SECRET = 'orange-client-secret';
    process.env.PAYNOTE_ORANGE_CUSTOMER_KEY = 'orange-customer-key';
    process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET = 'orange-customer-secret';

    const service = new PaynoteService();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('orange-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ StatusCode: 200 }),
      }) as unknown as typeof fetch;

    await service.orangePay({
      amount: 500,
      subscriberMsisdn: '695327301',
      orderId: 'ORANGE-MIGRATION-001',
      description: 'Test migration Orange',
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][1].headers.Authorization).toBe(
      `Basic ${Buffer.from('orange-client-id:orange-client-secret').toString('base64')}`,
    );
    expect(JSON.parse(calls[1][1].body).API_MUT).toMatchObject({
      customerkey: 'orange-customer-key',
      customersecret: 'orange-customer-secret',
      PaiementMethod: 'OM_CMR',
    });
  });

  it('does not reuse Orange customer keys as OAuth2 credentials', async () => {
    delete process.env.PAYNOTE_CLIENT_ID;
    delete process.env.PAYNOTE_CLIENT_SECRET;
    delete process.env.PAYNOTE_MUTUALIZED_CLIENT_ID;
    delete process.env.PAYNOTE_MUTUALIZED_CLIENT_SECRET;
    delete process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_ID;
    delete process.env.PAYNOTE_ORANGE_TOKEN_CLIENT_SECRET;
    process.env.PAYNOTE_ORANGE_CUSTOMER_KEY = 'orange-customer-key';
    process.env.PAYNOTE_ORANGE_CUSTOMER_SECRET = 'orange-customer-secret';

    const service = new PaynoteService();
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(service.getOrangeAccessToken()).rejects.toThrow(
      'PAYNOTE_ORANGE_TOKEN_CLIENT_ID/SECRET',
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('performs Orange Money payment with the legacy direct API', async () => {
    process.env.PAYNOTE_ORANGE_MODE = 'legacy';
    process.env.PAYNOTE_ORANGE_LEGACY_BASE_URL = 'https://api-s1.orange.cm';
    process.env.PAYNOTE_ORANGE_LEGACY_CUSTOMER_KEY = 'legacy-customer-key';
    process.env.PAYNOTE_ORANGE_LEGACY_CUSTOMER_SECRET =
      'legacy-customer-secret';
    process.env.PAYNOTE_ORANGE_LEGACY_X_AUTH_TOKEN = 'legacy-x-auth';
    process.env.PAYNOTE_ORANGE_LEGACY_CHANNEL_USER_MSISDN = '237699000000';
    process.env.PAYNOTE_ORANGE_LEGACY_PIN = '1234';

    const service = new PaynoteService();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('legacy-access-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Payment initialized',
          data: { payToken: 'MP-LEGACY-001' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Merchant payment successfully initiated',
          data: { payToken: 'MP-LEGACY-001', status: 'PENDING' },
        }),
      }) as unknown as typeof fetch;

    const result = await service.orangePay({
      amount: 1000,
      subscriberMsisdn: '237692000000',
      orderId: 'ORD-LEGACY-001',
      description: 'Paiement Orange ancien flux',
    });

    expect(result).toMatchObject({
      payToken: 'MP-LEGACY-001',
      data: { status: 'PENDING' },
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[0][0]).toBe('https://api-s1.orange.cm/token');
    expect(calls[0][1].headers.Authorization).toBe(
      `Basic ${Buffer.from('legacy-customer-key:legacy-customer-secret').toString('base64')}`,
    );
    expect(calls[1][0]).toBe(
      'https://api-s1.orange.cm/omcoreapis/1.0.2/mp/init',
    );
    expect(calls[1][1]).toMatchObject({
      method: 'POST',
      headers: {
        Authorization: 'Bearer legacy-access-token',
        'X-AUTH-TOKEN': 'legacy-x-auth',
      },
    });
    expect(calls[2][0]).toBe(
      'https://api-s1.orange.cm/omcoreapis/1.0.2/mp/pay',
    );
    expect(JSON.parse(calls[2][1].body)).toEqual({
      notifUrl: 'https://mysite.com/notif?token=test-webhook-secret',
      channelUserMsisdn: '699000000',
      amount: '1000',
      subscriberMsisdn: '692000000',
      pin: '1234',
      orderId: 'ORD-LEGACY-001',
      description: 'Paiement Orange ancien flux',
      payToken: 'MP-LEGACY-001',
    });
  });

  it('checks Orange status with the legacy payToken endpoint', async () => {
    process.env.PAYNOTE_ORANGE_MODE = 'legacy';
    process.env.PAYNOTE_ORANGE_LEGACY_CUSTOMER_KEY = 'legacy-customer-key';
    process.env.PAYNOTE_ORANGE_LEGACY_CUSTOMER_SECRET =
      'legacy-customer-secret';
    process.env.PAYNOTE_ORANGE_LEGACY_X_AUTH_TOKEN = 'legacy-x-auth';
    process.env.PAYNOTE_ORANGE_LEGACY_CHANNEL_USER_MSISDN = '699000000';
    process.env.PAYNOTE_ORANGE_LEGACY_PIN = '1234';

    const service = new PaynoteService();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('legacy-access-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            payToken: 'MP-LEGACY-001',
            status: 'SUCCESSFUL',
            confirmtxnstatus: '200',
          },
        }),
      }) as unknown as typeof fetch;

    const result = await service.orangePaymentStatus({
      messageId: 'MP-LEGACY-001',
    });

    expect(result).toMatchObject({ data: { status: 'SUCCESSFUL' } });
    const call = (global.fetch as jest.Mock).mock.calls[1];
    expect(call[0]).toBe(
      'https://api-s1.orange.cm/omcoreapis/1.0.2/mp/paymentstatus/MP-LEGACY-001',
    );
    expect(call[1]).toMatchObject({
      method: 'GET',
      headers: {
        Authorization: 'Bearer legacy-access-token',
        'X-AUTH-TOKEN': 'legacy-x-auth',
      },
    });
  });

  it('reports every missing legacy Orange merchant setting', async () => {
    process.env.PAYNOTE_ORANGE_MODE = 'legacy';
    delete process.env.PAYNOTE_ORANGE_LEGACY_X_AUTH_TOKEN;
    delete process.env.PAYNOTE_ORANGE_LEGACY_CHANNEL_USER_MSISDN;
    delete process.env.PAYNOTE_ORANGE_LEGACY_PIN;

    const service = new PaynoteService();
    global.fetch = jest.fn() as unknown as typeof fetch;

    await expect(
      service.orangePay({
        amount: 1000,
        subscriberMsisdn: '692000000',
        orderId: 'ORD-LEGACY-MISSING',
        description: 'Configuration incomplete',
      }),
    ).rejects.toThrow('PAYNOTE_ORANGE_LEGACY_X_AUTH_TOKEN');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
