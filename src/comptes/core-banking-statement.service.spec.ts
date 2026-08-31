import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { CoreBankingStatementService } from './core-banking-statement.service';

describe('CoreBankingStatementService', () => {
  const originalFetch = global.fetch;
  const envKeys = [
    'CORE_BANKING_BASE_URL',
    'CORE_BANKING_JWT_SECRET',
    'CORE_BANKING_JWT_ISSUER',
    'CORE_BANKING_JWT_AUDIENCE',
    'CORE_BANKING_TIMEOUT_MS',
    'SBS_JWT_SECRET',
  ] as const;
  const originalEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );

  beforeEach(() => {
    process.env.CORE_BANKING_BASE_URL = 'https://core.example.test/';
    process.env.CORE_BANKING_JWT_SECRET = 'test-secret-that-is-never-used-in-production';
    delete process.env.CORE_BANKING_JWT_ISSUER;
    delete process.env.CORE_BANKING_JWT_AUDIENCE;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      const value = originalEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    jest.restoreAllMocks();
  });

  it('uses a short-lived signed service token and forwards only the statement filters', async () => {
    const pdf = Buffer.from('%PDF-1.7\ncore statement');
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(pdf, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    );
    global.fetch = fetchMock;

    const result = await new CoreBankingStatementService().downloadStatement(
      42,
      '2026-08-01',
      '2026-08-28',
    );

    expect(result).toEqual(pdf);
    const [url, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'https://core.example.test/api/releve-compte/42?date_debut=2026-08-01&date_fin=2026-08-28',
    );
    expect(options.redirect).toBe('error');

    const authorization = String(
      (options.headers as Record<string, string>).Authorization,
    );
    const token = authorization.replace('Bearer ', '');
    const [header, payload, signature] = token.split('.');
    const expectedSignature = createHmac(
      'sha256',
      process.env.CORE_BANKING_JWT_SECRET!,
    )
      .update(`${header}.${payload}`)
      .digest('base64url');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());

    expect(signature).toBe(expectedSignature);
    expect(claims).toMatchObject({
      sub: 'apiclientsbs',
      iss: 'sbsclient',
      aud: 'collectapp',
      accountType: 'service',
      roles: ['SERVICE'],
    });
    expect(claims.exp - claims.iat).toBe(60);
    expect(claims.jti).toEqual(expect.any(String));
  });

  it('fails closed when the service secret is absent', async () => {
    delete process.env.CORE_BANKING_JWT_SECRET;
    delete process.env.SBS_JWT_SECRET;

    await expect(
      new CoreBankingStatementService().downloadStatement(42),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects a non-PDF response from the core banking', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response('{"error":"unexpected"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      new CoreBankingStatementService().downloadStatement(42),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('requires HTTPS outside local development', async () => {
    process.env.CORE_BANKING_BASE_URL = 'http://core.example.test/';

    await expect(
      new CoreBankingStatementService().downloadStatement(42),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
