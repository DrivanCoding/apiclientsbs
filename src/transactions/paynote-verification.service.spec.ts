import { PaynoteVerificationService } from './paynote-verification.service';

describe('PaynoteVerificationService', () => {
  it('rechecks pending Paynote deposits so delayed confirmations are finalized', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          references: 'COLL-MTN-001',
          operateur: 'momo',
          statut: 'en_attente',
          type_transaction: 'versement',
          provider_message_id: 'PAYNOTE-001',
          date_transaction: new Date(),
        },
        {
          references: 'COLL-OM-001',
          operateur: 'orange',
          statut: 'en_attente',
          type_transaction: 'versement',
          provider_message_id: 'PAYNOTE-002',
          date_transaction: new Date(),
        },
      ]),
    };
    const transactionsService = {
      recheckTransactionStatus: jest
        .fn()
        .mockResolvedValueOnce({ status: 'complete' })
        .mockResolvedValueOnce({ status: 'pending' }),
    };
    const service = new PaynoteVerificationService(
      repository as never,
      transactionsService as never,
    );

    await service.verifyPendingTransactions();

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { date_transaction: 'ASC' },
        take: 20,
      }),
    );
    expect(transactionsService.recheckTransactionStatus).toHaveBeenCalledTimes(
      2,
    );
    expect(
      transactionsService.recheckTransactionStatus,
    ).toHaveBeenNthCalledWith(1, 'COLL-MTN-001');
    expect(
      transactionsService.recheckTransactionStatus,
    ).toHaveBeenNthCalledWith(2, 'COLL-OM-001');
  });

  it('does not send unrelated pending transactions to Paynote', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([
        {
          references: 'COLL-OTHER-001',
          operateur: 'sbscollecte',
        },
      ]),
    };
    const transactionsService = {
      recheckTransactionStatus: jest.fn(),
    };
    const service = new PaynoteVerificationService(
      repository as never,
      transactionsService as never,
    );

    await service.verifyPendingTransactions();

    expect(transactionsService.recheckTransactionStatus).not.toHaveBeenCalled();
  });
});
