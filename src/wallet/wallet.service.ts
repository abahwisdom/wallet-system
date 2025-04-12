import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import {
  validateWalletId,
  validateAmount,
  findWalletOrFail,
  ensureSufficientBalance,
  createTransaction,
} from './utils/wallet-utils';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  /**
   * Creates a new wallet with optional initial balance
   */
  async createWallet(initialBalance: number = 0): Promise<Wallet> {
    validateAmount(initialBalance, 'Initial balance', false);
    const wallet = this.walletRepository.create({ balance: initialBalance });
    return this.walletRepository.save(wallet);
  }

  /**
   * Deposits funds into a wallet
   */
  async deposit(walletId: string, amount: number): Promise<Transaction> {
    validateWalletId(walletId);
    validateAmount(amount);

    const wallet = await findWalletOrFail(walletId, this.walletRepository);

    wallet.balance += amount;
    await this.walletRepository.save(wallet);

    return createTransaction(
      wallet,
      amount,
      'deposit',
      this.transactionRepository,
    );
  }

  /**
   * Withdraws funds from a wallet
   */
  async withdraw(walletId: string, amount: number): Promise<Transaction> {
    validateWalletId(walletId);
    validateAmount(amount);

    const wallet = await findWalletOrFail(walletId, this.walletRepository);
    ensureSufficientBalance(wallet, amount);

    wallet.balance -= amount;
    await this.walletRepository.save(wallet);

    return createTransaction(
      wallet,
      amount,
      'withdrawal',
      this.transactionRepository,
    );
  }

  /**
   * Transfers funds between wallets
   */
  async transfer(
    fromWalletId: string,
    toWalletId: string,
    amount: number,
  ): Promise<Transaction> {
    validateWalletId(fromWalletId);
    validateWalletId(toWalletId);
    validateAmount(amount);

    if (fromWalletId === toWalletId) {
      throw new BadRequestException('Cannot transfer to the same wallet');
    }

    const fromWallet = await findWalletOrFail(
      fromWalletId,
      this.walletRepository,
      'Sender wallet',
    );
    const toWallet = await findWalletOrFail(
      toWalletId,
      this.walletRepository,
      'Recipient wallet',
    );

    ensureSufficientBalance(fromWallet, amount);

    // Execute transfer
    fromWallet.balance -= amount;
    toWallet.balance += amount;

    // Save both wallets
    await Promise.all([
      this.walletRepository.save(fromWallet),
      this.walletRepository.save(toWallet),
    ]);

    return createTransaction(
      fromWallet,
      amount,
      'transfer',
      this.transactionRepository,
      toWalletId,
    );
  }

  /**
   * Gets paginated transaction history for a wallet
   */
  async getTransactionHistory(walletId: string, page: number, limit: number) {
    validateWalletId(walletId);

    if (page <= 0 || limit <= 0) {
      throw new BadRequestException('Page and limit must be positive numbers');
    }

    return this.transactionRepository.find({
      where: { wallet: { id: walletId } },
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
  }
}
