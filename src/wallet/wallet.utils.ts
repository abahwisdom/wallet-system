import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository, EntityManager } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { isUUID } from 'class-validator';
import { Subject } from 'rxjs';
import { RedisService } from '@liaoliaots/nestjs-redis';

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

/**
 * Validates the format of a wallet ID.
 * @param walletId - The wallet ID to validate.
 * @throws BadRequestException if the wallet ID is not a valid UUID.
 */
export function validateWalletId(walletId: string): void {
  if (!isUUID(walletId)) {
    throw new BadRequestException('Invalid wallet ID');
  }
}

/**
 * Validates the amount for a transaction.
 * @param amount - The amount to validate.
 * @param label - A label for the amount (default: 'Amount').
 * @param mustBePositive - Whether the amount must be positive (default: true).
 * @throws BadRequestException if the amount is invalid.
 */
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

/**
 * Finds a wallet by ID or throws an exception if not found.
 * @param walletId - The ID of the wallet to find.
 * @param walletRepositoryOrManager - The repository or entity manager to use.
 * @param label - A label for the wallet (default: 'Wallet').
 * @param useTransaction - Whether to use a transaction (default: false).
 * @returns The found wallet.
 * @throws NotFoundException if the wallet is not found.
 */
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

/**
 * Ensures that a wallet has sufficient balance for a transaction.
 * @param wallet - The wallet to check.
 * @param amount - The amount to check against the wallet's balance.
 * @throws BadRequestException if the wallet balance is insufficient.
 */
export function ensureSufficientBalance(wallet: Wallet, amount: number): void {
  if (wallet.balance < amount) {
    throw new BadRequestException('Insufficient balance');
  }
}

/**
 * Creates a new transaction and saves it to the database.
 * @param wallet - The wallet associated with the transaction.
 * @param amount - The transaction amount.
 * @param type - The type of transaction (e.g., 'deposit', 'withdrawal', 'transfer').
 * @param transactionRepository - The repository to save the transaction.
 * @param toWalletId - The ID of the destination wallet (for transfers only).
 * @returns The created transaction.
 */
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

export async function getRedisClient(redisService: RedisService) {
  return redisService.getOrThrow();
}

export function formatTransactionHistoryCacheKey(
  walletId: string,
  page: number,
  limit: number,
  filterType?: string,
): string {
  return `wallet:transactions:${walletId}:page:${page}:limit:${limit}:filter:${filterType || 'all'}`;
}

export async function getCachedWalletBalance(
  redisService: RedisService,
  walletId: string,
): Promise<number | null> {
  const redisClient = await getRedisClient(redisService);
  const cachedBalance = await redisClient.get(`wallet:balance:${walletId}`);
  return cachedBalance ? parseFloat(cachedBalance) : null;
}

export async function setCachedWalletBalance(
  redisService: RedisService,
  walletId: string,
  balance: number,
): Promise<void> {
  const redisClient = await getRedisClient(redisService);
  await redisClient.set(`wallet:balance:${walletId}`, balance.toString());
}

export async function invalidateWalletBalanceCache(
  redisService: RedisService,
  walletId: string,
): Promise<void> {
  const redisClient = await getRedisClient(redisService);
  await redisClient.del(`wallet:balance:${walletId}`);
}

export async function getCachedTransactionHistory(
  redisService: RedisService,
  walletId: string,
  page: number,
  limit: number,
  filterType?: string,
): Promise<any[] | null> {
  const redisClient = await getRedisClient(redisService);
  const cacheKey = formatTransactionHistoryCacheKey(
    walletId,
    page,
    limit,
    filterType,
  );
  const cachedHistory = await redisClient.get(cacheKey);
  return cachedHistory ? JSON.parse(cachedHistory) : null;
}

export async function setCachedTransactionHistory(
  redisService: RedisService,
  walletId: string,
  page: number,
  limit: number,
  filterType: string | undefined,
  history: any[],
): Promise<void> {
  const redisClient = await getRedisClient(redisService);
  const cacheKey = formatTransactionHistoryCacheKey(
    walletId,
    page,
    limit,
    filterType,
  );
  await redisClient.set(
    cacheKey,
    JSON.stringify(history),
    'EX',
    300, // Cache expires in 5 minutes
  );
}

export async function invalidateTransactionHistoryCache(
  redisService: RedisService,
  walletId: string,
): Promise<void> {
  const redisClient = await getRedisClient(redisService);
  await redisClient.del(`wallet:transactions:${walletId}`);
}
