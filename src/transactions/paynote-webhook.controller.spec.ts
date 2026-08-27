import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaynoteWebhookController } from './paynote-webhook.controller';

describe('PaynoteWebhookController', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('fails closed when the webhook secret is not configured', async () => {
    process.env = { ...originalEnv };
    delete process.env.PAYNOTE_WEBHOOK_SECRET;
    const service = { handlePaynoteWebhook: jest.fn() };
    const controller = new PaynoteWebhookController(service as any);

    await expect(
      controller.handleWebhook({}, { ip: '127.0.0.1' } as any),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(service.handlePaynoteWebhook).not.toHaveBeenCalled();
  });

  it('rejects an invalid secret', async () => {
    process.env = { ...originalEnv, PAYNOTE_WEBHOOK_SECRET: 'expected-secret' };
    const service = { handlePaynoteWebhook: jest.fn() };
    const controller = new PaynoteWebhookController(service as any);

    await expect(
      controller.handleWebhook(
        {},
        { ip: '127.0.0.1' } as any,
        'invalid-secret',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts the configured query secret without logging the payload', async () => {
    process.env = { ...originalEnv, PAYNOTE_WEBHOOK_SECRET: 'valid-secret' };
    const service = {
      handlePaynoteWebhook: jest
        .fn()
        .mockResolvedValue({ status: 'processed' }),
    };
    const controller = new PaynoteWebhookController(service as any);

    await expect(
      controller.handleWebhook(
        { private: 'payload' },
        { ip: '127.0.0.1' } as any,
        undefined,
        'valid-secret',
      ),
    ).resolves.toEqual({ status: 'processed' });
    expect(service.handlePaynoteWebhook).toHaveBeenCalledWith({
      private: 'payload',
    });
  });
});
