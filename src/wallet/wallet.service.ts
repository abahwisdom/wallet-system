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
} from './wallet.utils';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '@liaoliaots/nestjs-redis';

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

  async getCachedWalletBalance(walletId: string): Promise<number | null> {
    return getCachedWalletBalance(this.redisService, walletId);
  }

  async setCachedWalletBalance(
    walletId: string,
    balance: number,
  ): Promise<void> {
    return setCachedWalletBalance(this.redisService, walletId, balance);
  }

  async invalidateWalletBalanceCache(walletId: string): Promise<void> {
    return invalidateWalletBalanceCache(this.redisService, walletId);
  }

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

  async invalidateTransactionHistoryCache(walletId: string): Promise<void> {
    return invalidateTransactionHistoryCache(this.redisService, walletId);
  }

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
    await this.invalidateWalletBalanceCache(walletId); // Invalidate balance cache
    await this.invalidateTransactionHistoryCache(walletId); // Invalidate transaction history cache
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
    await this.invalidateWalletBalanceCache(walletId); // Invalidate balance cache
    await this.invalidateTransactionHistoryCache(walletId); // Invalidate transaction history cache
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
    await this.invalidateWalletBalanceCache(fromWalletId); // Invalidate sender's balance cache
    await this.invalidateWalletBalanceCache(toWalletId); // Invalidate receiver's balance cache
    await this.invalidateTransactionHistoryCache(fromWalletId); // Invalidate sender's transaction history cache
    await this.invalidateTransactionHistoryCache(toWalletId); // Invalidate receiver's transaction history cache
    return { message: 'Your transfer is currently being processed', jobId };
  }

  /**
   * Gets paginated transaction history for a wallet
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
      .take(limit)
      .where(
        '(transaction.walletId = :walletId OR transaction.toWalletId = :walletId)',
        { walletId },
      ); // Base condition for all related transactions

    if (filterType === 'deposit' || filterType === 'withdrawal') {
      query.andWhere('transaction.type = :type', { type: filterType });
    } else if (filterType === 'transfer_in') {
      query.andWhere('transaction.type = :type', { type: 'transfer' });
      query.andWhere('transaction.toWalletId = :walletId', { walletId }); // Explicitly filter for incoming transfers
    } else if (filterType === 'transfer_out') {
      query.andWhere('transaction.type = :type', { type: 'transfer' });
      query.andWhere('transaction.walletId = :walletId', { walletId }); // Explicitly filter for outgoing transfers
    } else if (filterType === 'transfer') {
      query.andWhere('transaction.type = :type', { type: 'transfer' });
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
