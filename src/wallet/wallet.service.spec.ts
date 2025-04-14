import { Test, TestingModule } from '@nestjs/testing';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Queue } from 'bullmq';
import { RedisService } from '@liaoliaots/nestjs-redis';
import * as utils from './wallet.utils';

describe('WalletService', () => {
  let service: WalletService;
  let queue: Queue;

  const mockWalletRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOneBy: jest.fn(),
  };

  const mockTransactionRepo = {
    createQueryBuilder: jest.fn(() => ({
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    })),
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
  };

  const mockRedisService = {
    getClient: jest.fn().mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(Wallet), useValue: mockWalletRepo },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepo,
        },
        { provide: DataSource, useValue: {} },
        { provide: 'BullQueue_transaction-queue', useValue: mockQueue },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    queue = module.get<Queue>('BullQueue_transaction-queue');
  });

  describe('createWallet', () => {
    it('should create and save a wallet with default balance', async () => {
      const wallet = { id: 'uuid', balance: 0, transactions: [] };
      mockWalletRepo.create.mockReturnValue(wallet);
      mockWalletRepo.save.mockResolvedValue(wallet);

      const result = await service.createWallet();

      expect(mockWalletRepo.create).toHaveBeenCalledWith({ balance: 0 });
      expect(mockWalletRepo.save).toHaveBeenCalledWith(wallet);
      expect(result).toEqual(wallet);
    });
  });

  describe('deposit', () => {
    it('should enqueue deposit job and invalidate cache', async () => {
      jest.spyOn(utils, 'validateWalletId').mockReturnValue(undefined);
      jest.spyOn(utils, 'validateAmount').mockReturnValue(undefined);
      jest
        .spyOn(service, 'invalidateWalletBalanceCache')
        .mockResolvedValue(undefined);
      jest
        .spyOn(service, 'invalidateTransactionHistoryCache')
        .mockResolvedValue(undefined);

      const result = await service.deposit('wallet-id', 100);

      expect(result).toEqual({
        message: 'Your deposit is currently being processed',
        jobId: 'mock-job-id',
      });
      expect(queue.add).toHaveBeenCalledWith(
        'deposit',
        { walletId: 'wallet-id', amount: 100 },
        expect.anything(),
      );
    });
  });

  describe('withdraw', () => {
    it('should enqueue withdraw job if balance is sufficient', async () => {
      const wallet = { id: 'wallet-id', balance: 200, transactions: [] };

      jest.spyOn(utils, 'validateWalletId').mockReturnValue(undefined);
      jest.spyOn(utils, 'validateAmount').mockReturnValue(undefined);
      jest.spyOn(utils, 'findWalletOrFail').mockResolvedValue(wallet);
      jest.spyOn(utils, 'ensureSufficientBalance').mockReturnValue(undefined);
      jest
        .spyOn(service, 'invalidateWalletBalanceCache')
        .mockResolvedValue(undefined);
      jest
        .spyOn(service, 'invalidateTransactionHistoryCache')
        .mockResolvedValue(undefined);

      const result = await service.withdraw('wallet-id', 50);

      expect(result).toEqual({
        message: 'Your withdrawal is currently being processed',
        jobId: 'mock-job-id',
      });
    });
  });

  describe('transfer', () => {
    it('should enqueue transfer job if balance is sufficient', async () => {
      const wallet = { id: 'wallet-id', balance: 500, transactions: [] };

      jest.spyOn(utils, 'validateWalletId').mockReturnValue(undefined);
      jest.spyOn(utils, 'validateAmount').mockReturnValue(undefined);
      jest.spyOn(utils, 'findWalletOrFail').mockResolvedValue(wallet);
      jest.spyOn(utils, 'ensureSufficientBalance').mockReturnValue(undefined);
      jest
        .spyOn(service, 'invalidateWalletBalanceCache')
        .mockResolvedValue(undefined);
      jest
        .spyOn(service, 'invalidateTransactionHistoryCache')
        .mockResolvedValue(undefined);

      const result = await service.transfer('wallet-id', 'target-id', 100);

      expect(result).toEqual({
        message: 'Your transfer is currently being processed',
        jobId: 'mock-job-id',
      });
    });

    it('should throw if transferring to same wallet', async () => {
      await expect(service.transfer('same-id', 'same-id', 100)).rejects.toThrow(
        'Cannot transfer to the same wallet',
      );
    });
  });
});
