import { Test, TestingModule } from '@nestjs/testing';
import { TransactionProcessor } from './transaction.processor';
import { WalletService } from './wallet.service';
import { Job } from 'bullmq';
import * as walletUtils from './wallet.utils';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';

jest.mock('./wallet.utils');

describe('TransactionProcessor', () => {
  let processor: TransactionProcessor;

  const mockWalletService = {
    dataSource: {
      transaction: jest.fn().mockImplementation((callback) =>
        callback({
          getRepository: jest.fn().mockReturnValue({
            save: jest.fn(),
          }),
        }),
      ),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionProcessor,
        { provide: WalletService, useValue: mockWalletService },
      ],
    }).compile();

    processor = module.get<TransactionProcessor>(TransactionProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('handleDeposit', () => {
    it('should handle deposit transactions', async () => {
      const job = { data: { walletId: '1', amount: 100 } } as Job;
      const mockWallet = { id: '1', balance: 0 } as Wallet;

      jest.spyOn(walletUtils, 'findWalletOrFail').mockResolvedValue(mockWallet);
      jest
        .spyOn(walletUtils, 'createTransaction')
        .mockResolvedValue({} as Transaction);

      await processor['handleDeposit'](job);

      expect(walletUtils.findWalletOrFail).toHaveBeenCalledWith(
        '1',
        expect.any(Object),
        'Wallet',
        true,
      );
      expect(walletUtils.createTransaction).toHaveBeenCalledWith(
        mockWallet,
        100,
        'deposit',
        expect.any(Object),
      );
    });
  });

  describe('handleWithdrawal', () => {
    it('should handle withdrawal transactions', async () => {
      const job = { data: { walletId: '1', amount: 50 } } as Job;
      const mockWallet = { id: '1', balance: 100 } as Wallet;

      jest.spyOn(walletUtils, 'findWalletOrFail').mockResolvedValue(mockWallet);
      jest
        .spyOn(walletUtils, 'ensureSufficientBalance')
        .mockImplementation(() => {});
      jest
        .spyOn(walletUtils, 'createTransaction')
        .mockResolvedValue({} as Transaction);

      await processor['handleWithdrawal'](job);

      expect(walletUtils.findWalletOrFail).toHaveBeenCalledWith(
        '1',
        expect.any(Object),
        'Wallet',
        true,
      );
      expect(walletUtils.ensureSufficientBalance).toHaveBeenCalledWith(
        mockWallet,
        50,
      );
      expect(walletUtils.createTransaction).toHaveBeenCalledWith(
        mockWallet,
        50,
        'withdrawal',
        expect.any(Object),
      );
    });
  });

  describe('handleTransfer', () => {
    it('should handle transfer transactions', async () => {
      const job = {
        data: { fromWalletId: '1', toWalletId: '2', amount: 30 },
      } as Job;
      const mockFromWallet = { id: '1', balance: 100 } as Wallet;
      const mockToWallet = { id: '2', balance: 50 } as Wallet;

      jest
        .spyOn(walletUtils, 'findWalletOrFail')
        .mockResolvedValueOnce(mockFromWallet)
        .mockResolvedValueOnce(mockToWallet);
      jest
        .spyOn(walletUtils, 'ensureSufficientBalance')
        .mockImplementation(() => {});
      jest
        .spyOn(walletUtils, 'createTransaction')
        .mockResolvedValue({} as Transaction);

      await processor['handleTransfer'](job);

      expect(walletUtils.findWalletOrFail).toHaveBeenCalledWith(
        '1',
        expect.any(Object),
        'Sender wallet',
        true,
      );
      expect(walletUtils.findWalletOrFail).toHaveBeenCalledWith(
        '2',
        expect.any(Object),
        'Recipient wallet',
        true,
      );
      expect(walletUtils.ensureSufficientBalance).toHaveBeenCalledWith(
        mockFromWallet,
        30,
      );
      expect(walletUtils.createTransaction).toHaveBeenCalledWith(
        mockFromWallet,
        30,
        'transfer',
        expect.any(Object),
        '2',
      );
    });
  });
});
