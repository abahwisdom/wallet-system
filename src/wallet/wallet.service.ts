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

    return {
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
  }
}
