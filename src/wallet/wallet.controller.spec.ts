import { Test, TestingModule } from '@nestjs/testing';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { TransactionDto } from './dto/transaction.dto';
import { TransferDto } from './dto/transfer.dto';

const mockWalletService = {
  createWallet: jest.fn(),
  deposit: jest.fn(),
  withdraw: jest.fn(),
  transfer: jest.fn(),
  getTransactionHistory: jest.fn(),
};

describe('WalletController', () => {
  let controller: WalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WalletController],
      providers: [{ provide: WalletService, useValue: mockWalletService }],
    }).compile();

    controller = module.get<WalletController>(WalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createWallet', () => {
    it('should create a wallet', async () => {
      const dto: CreateWalletDto = { initialBalance: 100 };
      const result = { id: '1', balance: 100 };
      mockWalletService.createWallet.mockResolvedValue(result);

      expect(await controller.createWallet(dto)).toEqual(result);
      expect(mockWalletService.createWallet).toHaveBeenCalledWith(100);
    });
  });

  describe('deposit', () => {
    it('should deposit funds into a wallet', async () => {
      const id = '1';
      const dto: TransactionDto = { amount: 50 };
      const result = { message: 'Deposit processed', jobId: 'job-id' };
      mockWalletService.deposit.mockResolvedValue(result);

      expect(await controller.deposit(id, dto)).toEqual(result);
      expect(mockWalletService.deposit).toHaveBeenCalledWith(id, 50);
    });
  });

  describe('withdraw', () => {
    it('should withdraw funds from a wallet', async () => {
      const id = '1';
      const dto: TransactionDto = { amount: 30 };
      const result = { message: 'Withdrawal processed', jobId: 'job-id' };
      mockWalletService.withdraw.mockResolvedValue(result);

      expect(await controller.withdraw(id, dto)).toEqual(result);
      expect(mockWalletService.withdraw).toHaveBeenCalledWith(id, 30);
    });
  });

  describe('transfer', () => {
    it('should transfer funds between wallets', async () => {
      const fromId = '1';
      const toId = '2';
      const dto: TransferDto = { amount: 20 };
      const result = { message: 'Transfer processed', jobId: 'job-id' };
      mockWalletService.transfer.mockResolvedValue(result);

      expect(
        await controller.transfer(fromId, toId, dto, 'idempotency-key'),
      ).toEqual(result);
      expect(mockWalletService.transfer).toHaveBeenCalledWith(fromId, toId, 20);
    });
  });

  describe('getTransactionHistory', () => {
    it('should retrieve transaction history', async () => {
      const id = '1';
      const result = { data: [], meta: {} };
      mockWalletService.getTransactionHistory.mockResolvedValue(result);

      expect(
        await controller.getTransactionHistory(id, 1, 10, 'deposit'),
      ).toEqual(result);
      expect(mockWalletService.getTransactionHistory).toHaveBeenCalledWith(
        id,
        1,
        10,
        'deposit',
      );
    });
  });
});
