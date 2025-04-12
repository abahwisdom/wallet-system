import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Wallet } from '../entities/wallet.entity';
import { Transaction } from '../entities/transaction.entity';
import { isUUID } from 'class-validator';

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
  walletRepository: Repository<Wallet>,
  label: string = 'Wallet',
): Promise<Wallet> {
  const wallet = await walletRepository.findOneBy({ id: walletId });
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
  relatedWalletId?: string,
): Promise<Transaction> {
  const transaction = transactionRepository.create({
    wallet,
    amount,
    type,
    relatedWalletId,
  });
  return transactionRepository.save(transaction);
}
