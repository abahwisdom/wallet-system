import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository, EntityManager } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { isUUID } from 'class-validator';
import { Subject } from 'rxjs';

// Shared Subject for transaction status updates
export const transactionStatusSubject = new Subject<{
  jobId: string;
  walletId: string;
  type: string;
  status: string;
  payload?: any;
  timestamp: string;
  error?: string;
}>();

type TransactionType = 'deposit' | 'withdrawal' | 'transfer';

export function validateWalletId(walletId: string): void {
  if (!isUUID(walletId)) {
    throw new BadRequestException('Invalid wallet ID');
  }
}

export function validateAmount(
  amount: number,
  label: string = 'Amount',
  mustBePositive: boolean = true,
): void {
  if (typeof amount !== 'number') {
    throw new BadRequestException(`${label} must be a number`);
  }

  if (mustBePositive && amount <= 0) {
    throw new BadRequestException(`${label} must be a positive number`);
  } else if (!mustBePositive && amount < 0) {
    throw new BadRequestException(`${label} must be a non-negative number`);
  }
}

export async function findWalletOrFail(
  walletId: string,
  walletRepositoryOrManager: Repository<Wallet> | EntityManager,
  label: string = 'Wallet',
  useTransaction: boolean = false,
): Promise<Wallet> {
  let wallet;

  if (useTransaction && walletRepositoryOrManager instanceof EntityManager) {
    wallet = await walletRepositoryOrManager
      .getRepository(Wallet)
      .createQueryBuilder('wallet')
      .setLock('pessimistic_write')
      .where('wallet.id = :id', { id: walletId })
      .getOne();
  } else if (walletRepositoryOrManager instanceof Repository) {
    wallet = await walletRepositoryOrManager.findOneBy({ id: walletId });
  } else {
    throw new Error('Invalid repository or manager provided');
  }

  if (!wallet) {
    throw new NotFoundException(`${label} not found`);
  }

  return wallet;
}

export function ensureSufficientBalance(wallet: Wallet, amount: number): void {
  if (wallet.balance < amount) {
    throw new BadRequestException('Insufficient balance');
  }
}

export async function createTransaction(
  wallet: Wallet,
  amount: number,
  type: TransactionType,
  transactionRepository: Repository<Transaction>,
  toWalletId?: string, // used only for transfers
): Promise<Transaction> {
  const transaction = transactionRepository.create({
    wallet,
    walletId: wallet.id,
    amount,
    type,
    toWalletId: type === 'transfer' ? toWalletId : null,
  });

  return transactionRepository.save(transaction);
}
