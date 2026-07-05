import { PaynoteService } from './paynote.service';

const originalFetch = global.fetch;
const originalEnv = process.env;

function mockFetchOnce(response: Partial<Response>) {
  global.fetch = jest
    .fn()
    .mockResolvedValue(response) as unknown as typeof fetch;
}

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

function invalidCredentialsXmlResponse(): Partial<Response> {
  return {
    ok: false,
    status: 401,
    text: async () =>
      '<ams:fault xmlns:ams="http://wso2.org/apimanager/security">' +
      '<ams:code>900901</ams:code>' +
      '<ams:message>Invalid Credentials</ams:message>' +
      '<ams:description>Access failure for API: /omcoreapis/1.0.2, version: 1.0.2 status: (900901) - Invalid Credentials.</ams:description>' +
      '</ams:fault>',
  };
}

describe('PaynoteService', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PAYNOTE_ORANGE_CUSTOMER_KEY: 'customer-key',
      PAYNOTE_ORANGE_CUSTOMER_SECRET: 'customer-secret',
      PAYNOTE_ORANGE_X_AUTH_TOKEN: 'x-auth-token',
      PAYNOTE_ORANGE_TOKEN_URL: 'https://api-s1.orange.cm/token',
      PAYNOTE_ORANGE_API_BASE: 'https://api-s1.orange.cm',
      PAYNOTE_TIMEOUT_MS: '1000',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('maps Orange 900901 XML faults to a safe credentials message', async () => {
    const service = new PaynoteService();

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('access-token'))
      .mockResolvedValueOnce(invalidCredentialsXmlResponse())
      .mockResolvedValueOnce(tokenResponse('refreshed-token'))
      .mockResolvedValueOnce(
        invalidCredentialsXmlResponse(),
      ) as unknown as typeof fetch;

    await expect(service.initPayment()).rejects.toMatchObject({
      message: expect.stringContaining(
        'Configuration Paynote/Orange invalide ou jeton expire.',
      ),
    });

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('access-token'))
      .mockResolvedValueOnce(invalidCredentialsXmlResponse())
      .mockResolvedValueOnce(tokenResponse('refreshed-token'))
      .mockResolvedValueOnce(
        invalidCredentialsXmlResponse(),
      ) as unknown as typeof fetch;

    try {
      await service.initPayment();
    } catch (error) {
      expect((error as Error).message).not.toContain('<ams:fault');
    }
  });

  it('refreshes the Orange token and retries init once after a 900901 fault', async () => {
    const service = new PaynoteService();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(tokenResponse('expired-token'))
      .mockResolvedValueOnce(invalidCredentialsXmlResponse())
      .mockResolvedValueOnce(tokenResponse('fresh-token'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: 'Merchant payment request successfully initiated',
          data: { payToken: 'pay-token' },
        }),
      }) as unknown as typeof fetch;

    await expect(service.initPayment()).resolves.toMatchObject({
      data: { payToken: 'pay-token' },
    });

    const calls = (global.fetch as jest.Mock).mock.calls;
    expect(calls[1][1].headers.Authorization).toBe('Bearer expired-token');
    expect(calls[3][1].headers.Authorization).toBe('Bearer fresh-token');
  });

  it('maps token endpoint failures without exposing raw provider body', async () => {
    const service = new PaynoteService();
    mockFetchOnce({
      ok: false,
      status: 401,
      text: async () =>
        '{"fault":{"code":"900901","message":"Invalid Credentials"}}',
    });

    await expect(service.getOrangeAccessToken()).rejects.toMatchObject({
      message: expect.stringContaining(
        'Configuration Paynote/Orange invalide ou jeton expire.',
      ),
    });

    mockFetchOnce({
      ok: false,
      status: 401,
      text: async () =>
        '{"fault":{"code":"900901","message":"Invalid Credentials"}}',
    });

    try {
      await service.getOrangeAccessToken();
    } catch (error) {
      expect((error as Error).message).not.toContain('Invalid Credentials');
    }
  });
});
