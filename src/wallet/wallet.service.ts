import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import {
  validateWalletId,
  validateAmount,
  transactionStatusSubject,
  getCachedWalletBalance,
  setCachedWalletBalance,
  invalidateWalletBalanceCache,
  getCachedTransactionHistory,
  setCachedTransactionHistory,
  invalidateTransactionHistoryCache,
  findWalletOrFail,
  ensureSufficientBalance,
} from './wallet.utils';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '@liaoliaots/nestjs-redis';

/**
 * Service for managing wallet operations such as deposits, withdrawals, and transfers.
 */
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

    private readonly redisService: RedisService, // Inject RedisService
  ) {}

  /**
   * Retrieves the cached balance of a wallet.
   * @param walletId - The ID of the wallet.
   * @returns The cached balance or null if not found.
   */
  async getCachedWalletBalance(walletId: string): Promise<number | null> {
    return getCachedWalletBalance(this.redisService, walletId);
  }

  /**
   * Sets the cached balance of a wallet.
   * @param walletId - The ID of the wallet.
   * @param balance - The balance to cache.
   */
  async setCachedWalletBalance(
    walletId: string,
    balance: number,
  ): Promise<void> {
    return setCachedWalletBalance(this.redisService, walletId, balance);
  }

  /**
   * Invalidates the cached balance of a wallet.
   * @param walletId - The ID of the wallet.
   */
  async invalidateWalletBalanceCache(walletId: string): Promise<void> {
    return invalidateWalletBalanceCache(this.redisService, walletId);
  }

  /**
   * Retrieves the cached transaction history of a wallet.
   * @param walletId - The ID of the wallet.
   * @param page - The page number.
   * @param limit - The number of transactions per page.
   * @param filterType - Optional filter for transaction type.
   * @returns The cached transaction history or null if not found.
   */
  async getCachedTransactionHistory(
    walletId: string,
    page: number,
    limit: number,
    filterType?: string,
  ): Promise<any[] | null> {
    return getCachedTransactionHistory(
      this.redisService,
      walletId,
      page,
      limit,
      filterType,
    );
  }

  /**
   * Sets the cached transaction history of a wallet.
   * @param walletId - The ID of the wallet.
   * @param page - The page number.
   * @param limit - The number of transactions per page.
   * @param filterType - Optional filter for transaction type.
   * @param history - The transaction history to cache.
   */
  async setCachedTransactionHistory(
    walletId: string,
    page: number,
    limit: number,
    filterType: string | undefined,
    history: any[],
  ): Promise<void> {
    return setCachedTransactionHistory(
      this.redisService,
      walletId,
      page,
      limit,
      filterType,
      history,
    );
  }

  /**
   * Invalidates the cached transaction history of a wallet.
   * @param walletId - The ID of the wallet.
   */
  async invalidateTransactionHistoryCache(walletId: string): Promise<void> {
    return invalidateTransactionHistoryCache(this.redisService, walletId);
  }

  /**
   * Enqueues a transaction job for processing.
   * @param type - The type of transaction (e.g., 'deposit', 'withdraw').
   * @param payload - The transaction details.
   * @param walletId - The ID of the wallet.
   * @returns The job ID of the enqueued transaction.
   */
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
        removeOnComplete: {
          age: 3600, // seconds (1 hour after completion)
          count: 1000, // or keep only last 1000 completed jobs
        },
        removeOnFail: {
          age: 86400, // 1 day
          count: 100, // or keep last 100 failed jobs
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
   * Creates a new wallet with an optional initial balance.
   * @param initialBalance - The initial balance of the wallet (default: 0).
   * @returns The created wallet.
   */
  async createWallet(initialBalance: number = 0): Promise<Wallet> {
    validateAmount(initialBalance, 'Initial balance', false);
    const wallet = this.walletRepository.create({ balance: initialBalance });
    return this.walletRepository.save(wallet);
  }

  /**
   * Deposits funds into a wallet.
   * @param walletId - The ID of the wallet.
   * @param amount - The amount to deposit.
   * @returns A message and the job ID of the deposit transaction.
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
    await this.invalidateWalletBalanceCache(walletId); // Invalidate balance cache
    await this.invalidateTransactionHistoryCache(walletId); // Invalidate transaction history cache
    return { message: 'Your deposit is currently being processed', jobId };
  }

  /**
   * Withdraws funds from a wallet.
   * @param walletId - The ID of the wallet.
   * @param amount - The amount to withdraw.
   * @returns A message and the job ID of the withdrawal transaction.
   */
  async withdraw(
    walletId: string,
    amount: number,
  ): Promise<{ message: string; jobId: string }> {
    validateWalletId(walletId);
    validateAmount(amount);

    const userWallet = await findWalletOrFail(
      walletId,
      this.walletRepository,
      'Wallet',
      true,
    );
    ensureSufficientBalance(userWallet, amount);

    const jobId = await this.enqueueTransaction(
      'withdraw',
      { walletId, amount },
      walletId,
    );
    await this.invalidateWalletBalanceCache(walletId); // Invalidate balance cache
    await this.invalidateTransactionHistoryCache(walletId); // Invalidate transaction history cache
    return { message: 'Your withdrawal is currently being processed', jobId };
  }

  /**
   * Transfers funds between wallets.
   * @param fromWalletId - The ID of the sender's wallet.
   * @param toWalletId - The ID of the recipient's wallet.
   * @param amount - The amount to transfer.
   * @returns A message and the job ID of the transfer transaction.
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

    const fromWallet = await findWalletOrFail(
      fromWalletId,
      this.walletRepository,
      'Sender wallet',
      true,
    );
    ensureSufficientBalance(fromWallet, amount);

    const jobId = await this.enqueueTransaction(
      'transfer',
      {
        fromWalletId,
        toWalletId,
        amount,
      },
      fromWalletId,
    );
    await this.invalidateWalletBalanceCache(fromWalletId); // Invalidate sender's balance cache
    await this.invalidateWalletBalanceCache(toWalletId); // Invalidate receiver's balance cache
    await this.invalidateTransactionHistoryCache(fromWalletId); // Invalidate sender's transaction history cache
    await this.invalidateTransactionHistoryCache(toWalletId); // Invalidate receiver's transaction history cache
    return { message: 'Your transfer is currently being processed', jobId };
  }

  /**
   * Retrieves paginated transaction history for a wallet.
   * @param walletId - The ID of the wallet.
   * @param page - The page number (default: 1).
   * @param limit - The number of transactions per page (default: 10).
   * @param filterType - Optional filter for transaction type.
   * @returns The transaction history and metadata.
   */
  async getTransactionHistory(
    walletId: string,
    page = 1,
    limit = 10,
    filterType?:
      | 'deposit'
      | 'withdrawal'
      | 'transfer'
      | 'transfer_in'
      | 'transfer_out',
  ) {
    validateWalletId(walletId);
    await findWalletOrFail(walletId, this.walletRepository, 'Wallet', true);

    const cachedHistory = await this.getCachedTransactionHistory(
      walletId,
      page,
      limit,
      filterType,
    );
    if (cachedHistory) {
      return { data: cachedHistory, meta: { cached: true } };
    }

    const query = this.transactionRepository
      .createQueryBuilder('transaction')
      .orderBy('transaction.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (!filterType) {
      query.where(
        '(transaction.walletId = :walletId OR transaction.toWalletId = :walletId)',
        { walletId },
      );
    } else if (filterType === 'transfer_in') {
      query.where(
        'transaction.type = :type AND transaction.toWalletId = :walletId',
        {
          type: 'transfer',
          walletId,
        },
      );
    } else if (filterType === 'transfer_out') {
      query.where(
        'transaction.type = :type AND transaction.walletId = :walletId',
        {
          type: 'transfer',
          walletId,
        },
      );
    } else {
      // deposit, withdrawal, or transfer (general)
      query.where(
        'transaction.type = :type AND transaction.walletId = :walletId',
        {
          type: filterType,
          walletId,
        },
      );
    }

    const [result, total] = await query.getManyAndCount();

    const enriched = result.map((tx) => {
      if (tx.type !== 'transfer') return tx;

      const isIncoming = tx.toWalletId === walletId;
      return {
        ...tx,
        direction: isIncoming ? 'transfer_in' : 'transfer_out',
      };
    });

    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    const finalResult = {
      data: enriched,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };

    await this.setCachedTransactionHistory(
      walletId,
      page,
      limit,
      filterType,
      finalResult.data,
    ); // Cache the result
    return finalResult;
  }
}
