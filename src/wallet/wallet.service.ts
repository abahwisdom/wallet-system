import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import {
  validateWalletId,
  validateAmount,
  transactionStatusSubject,
} from './wallet.utils';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,

    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,

    public readonly dataSource: DataSource, // Changed from private to public

    @InjectQueue('transaction-queue')
    private readonly transactionQueue: Queue, // Inject BullMQ queue
  ) {}

  async enqueueTransaction(
    type: string,
    payload: any,
    walletId: string,
  ): Promise<string> {
    const job = await this.transactionQueue.add(
      type,
      { ...payload, walletId },
      {
        attempts: 3, // Retry up to 3 times
        backoff: {
          type: 'exponential', // Exponential backoff
          delay: 1000, // Start with a 1-second delay
        },
      },
    );

    // Push transaction status update to the Subject
    transactionStatusSubject.next({
      jobId: job.id,
      type,
      payload,
      walletId,
      status: 'enqueued',
      timestamp: new Date().toISOString(),
    });

    return job.id; // Return the job ID
  }

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
  async deposit(
    walletId: string,
    amount: number,
  ): Promise<{ message: string; jobId: string }> {
    validateWalletId(walletId);
    validateAmount(amount);

    const jobId = await this.enqueueTransaction(
      'deposit',
      { walletId, amount },
      walletId,
    );
    return { message: 'Your deposit is currently being processed', jobId };
  }

  /**
   * Withdraws funds from a wallet
   */
  async withdraw(
    walletId: string,
    amount: number,
  ): Promise<{ message: string; jobId: string }> {
    validateWalletId(walletId);
    validateAmount(amount);

    const jobId = await this.enqueueTransaction(
      'withdraw',
      { walletId, amount },
      walletId,
    );
    return { message: 'Your withdrawal is currently being processed', jobId };
  }

  /**
   * Transfers funds between wallets
   */
  async transfer(
    fromWalletId: string,
    toWalletId: string,
    amount: number,
  ): Promise<{ message: string; jobId: string }> {
    validateWalletId(fromWalletId);
    validateWalletId(toWalletId);
    validateAmount(amount);

    if (fromWalletId === toWalletId) {
      throw new BadRequestException('Cannot transfer to the same wallet');
    }

    const jobId = await this.enqueueTransaction(
      'transfer',
      {
        fromWalletId,
        toWalletId,
        amount,
      },
      fromWalletId,
    );
    return { message: 'Your transfer is currently being processed', jobId };
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
