import {
  validateWalletId,
  validateAmount,
  findWalletOrFail,
  ensureSufficientBalance,
} from './wallet.utils';
import { Wallet } from './entities/wallet.entity';
import { Repository } from 'typeorm';
import { NotFoundException } from '@nestjs/common';

describe('Wallet Utils', () => {
  describe('validateWalletId', () => {
    it('should throw an error for an invalid UUID', () => {
      expect(() => validateWalletId('invalid-uuid')).toThrow(
        'Invalid wallet ID',
      );
    });

    it('should not throw an error for a valid UUID', () => {
      expect(() =>
        validateWalletId('550e8400-e29b-41d4-a716-446655440000'),
      ).not.toThrow();
    });
  });

  describe('validateAmount', () => {
    it('should throw an error if the amount is not a number', () => {
      expect(() => validateAmount('not-a-number' as any)).toThrow(
        'Amount must be a number',
      );
    });

    it('should throw an error if the amount is not positive', () => {
      expect(() => validateAmount(-10)).toThrow(
        'Amount must be a positive number',
      );
    });

    it('should not throw an error for a valid positive amount', () => {
      expect(() => validateAmount(100)).not.toThrow();
    });
  });
  describe('findWalletOrFail', () => {
    const mockWalletId = 'wallet-id-123';
    const mockWallet: Wallet = {
      id: mockWalletId,
      balance: 100,
      transactions: [],
    };

    let mockRepository: Partial<Repository<Wallet>>;

    beforeEach(() => {
      mockRepository = {
        findOneBy: jest.fn().mockResolvedValue(mockWallet),
      };

      // 🔥 Force the mock to pass instanceof Repository
      Object.setPrototypeOf(mockRepository, Repository.prototype);
    });

    it('should return the wallet if found', async () => {
      const result = await findWalletOrFail(
        mockWalletId,
        mockRepository as Repository<Wallet>,
      );
      expect(result).toBe(mockWallet);
      expect(mockRepository.findOneBy).toHaveBeenCalledWith({
        id: mockWalletId,
      });
    });

    it('should throw NotFoundException if wallet is not found', async () => {
      (mockRepository.findOneBy as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        findWalletOrFail(mockWalletId, mockRepository as Repository<Wallet>),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw if invalid repository or manager is passed', async () => {
      await expect(findWalletOrFail(mockWalletId, {} as any)).rejects.toThrow(
        'Invalid repository or manager provided',
      );
    });
  });

  describe('ensureSufficientBalance', () => {
    it('should throw an error if the balance is insufficient', () => {
      const mockWallet = { balance: 50 } as Wallet;

      expect(() => ensureSufficientBalance(mockWallet, 100)).toThrow(
        'Insufficient balance',
      );
    });

    it('should not throw an error if the balance is sufficient', () => {
      const mockWallet = { balance: 150 } as Wallet;

      expect(() => ensureSufficientBalance(mockWallet, 100)).not.toThrow();
    });
  });
});
