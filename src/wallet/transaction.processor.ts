import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { WalletService } from './wallet.service';
import { Wallet } from './entities/wallet.entity';
import {
  ensureSufficientBalance,
  findWalletOrFail,
  createTransaction,
  transactionStatusSubject,
} from './wallet.utils';
import { Transaction } from './entities/transaction.entity';

/**
 * Processor for handling transaction-related jobs in the queue.
 */
@Processor('transaction-queue')
export class TransactionProcessor extends WorkerHost {
  constructor(private readonly walletService: WalletService) {
    super();
  }

  /**
   * Processes a job from the transaction queue.
   * @param job - The job to process.
   * @throws Error if the job name is unknown or processing fails.
   */
  async process(job: Job<any, any, string>): Promise<any> {
    try {
      switch (job.name) {
        case 'deposit':
          await this.handleDeposit(job);
          break;
        case 'withdraw':
          await this.handleWithdrawal(job);
          break;
        case 'transfer':
          await this.handleTransfer(job);
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }

      this.updateTransactionStatus(job, 'completed');
    } catch (error) {
      this.updateTransactionStatus(job, 'failed', error.message);
      throw error; // Rethrow the error to mark the job as failed
    }
  }

  /**
   * Handles deposit transactions.
   * @param job - The job containing deposit details.
   */
  private async handleDeposit(job: Job): Promise<void> {
    const { walletId, amount } = job.data;
    await this.walletService.dataSource.transaction(async (manager) => {
      const wallet = await findWalletOrFail(walletId, manager, 'Wallet', true);
      wallet.balance += amount;
      await manager.getRepository(Wallet).save(wallet);
      await createTransaction(
        wallet,
        amount,
        'deposit',
        manager.getRepository(Transaction),
      );
    });
  }

  /**
   * Handles withdrawal transactions.
   * @param job - The job containing withdrawal details.
   */
  private async handleWithdrawal(job: Job): Promise<void> {
    const { walletId, amount } = job.data;
    await this.walletService.dataSource.transaction(async (manager) => {
      const wallet = await findWalletOrFail(walletId, manager, 'Wallet', true);
      ensureSufficientBalance(wallet, amount);
      wallet.balance -= amount;
      await manager.getRepository(Wallet).save(wallet);
      await createTransaction(
        wallet,
        amount,
        'withdrawal',
        manager.getRepository(Transaction),
      );
    });
  }

  /**
   * Handles transfer transactions between wallets.
   * @param job - The job containing transfer details.
   */
  private async handleTransfer(job: Job): Promise<void> {
    const { fromWalletId, toWalletId, amount } = job.data;
    await this.walletService.dataSource.transaction(async (manager) => {
      const fromWallet = await findWalletOrFail(
        fromWalletId,
        manager,
        'Sender wallet',
        true,
      );
      const toWallet = await findWalletOrFail(
        toWalletId,
        manager,
        'Recipient wallet',
        true,
      );
      ensureSufficientBalance(fromWallet, amount);
      fromWallet.balance -= amount;
      toWallet.balance += amount;
      await Promise.all([
        manager.getRepository(Wallet).save(fromWallet),
        manager.getRepository(Wallet).save(toWallet),
      ]);
      await createTransaction(
        fromWallet,
        amount,
        'transfer',
        manager.getRepository(Transaction),
        toWalletId,
      );
    });
  }

  /**
   * Updates the status of a transaction job.
   * @param job - The job whose status is being updated.
   * @param status - The new status of the job (e.g., 'completed', 'failed').
   * @param errorMessage - Optional error message if the job failed.
   */
  private updateTransactionStatus(
    job: Job,
    status: string,
    errorMessage?: string,
  ): void {
    console.log(job.attemptsMade, job.opts.attempts);
    console.log('Job status:', status);
    if (
      status === 'completed' ||
      (status === 'failed' && job.attemptsMade >= job.opts.attempts - 1)
    ) {
      transactionStatusSubject.next({
        jobId: job.id,
        walletId: job.data.walletId,
        type: job.name,
        status,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
