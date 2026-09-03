import { UnauthorizedException } from '@nestjs/common';
import { TransactionsController } from './transactions.controller';

describe('TransactionsController', () => {
  const service = {
    findByClient: jest.fn(),
  };
  const controller = new TransactionsController(service as never);

  beforeEach(() => {
    service.findByClient.mockReset();
    service.findByClient.mockResolvedValue([]);
  });

  it('loads only the transactions of the authenticated client', async () => {
    await expect(
      controller.findMine(
        { user: { sub: 42, idclient: 42 } },
        undefined,
        undefined,
      ),
    ).resolves.toEqual([]);

    expect(service.findByClient).toHaveBeenCalledWith(
      42,
      undefined,
      undefined,
      true,
    );
  });

  it('refuses the client route when the token has no client identifier', () => {
    expect(() => controller.findMine({ user: {} })).toThrow(
      UnauthorizedException,
    );

    expect(service.findByClient).not.toHaveBeenCalled();
  });

  it('keeps the separate administrator lookup available', async () => {
    await expect(
      controller.findByClient(42, '2026-08-01', '2026-08-31'),
    ).resolves.toEqual([]);

    expect(service.findByClient).toHaveBeenCalledWith(
      42,
      '2026-08-01',
      '2026-08-31',
    );
  });
});
