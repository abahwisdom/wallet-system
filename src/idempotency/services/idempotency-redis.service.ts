import { Injectable } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import {
  IDEMPOTENCY_KEY_PREFIX,
  IDEMPOTENCY_LOCK_PREFIX,
} from '../constants/idempotency.constants';

@Injectable()
export class IdempotencyRedisService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Retrieves data associated with the idempotency key.
   * @param key - The idempotency key.
   * @returns Parsed data or null if not found.
   */
  async get(key: string): Promise<any> {
    const value = await this.getRedisClient().get(this.formatCacheKey(key));
    return value ? JSON.parse(value) : null;
  }

  /**
   * Stores data associated with the idempotency key.
   * @param key - The idempotency key.
   * @param data - The data to store.
   * @param ttl - Time to live in seconds.
   */
  async set(key: string, data: any, ttl: number): Promise<void> {
    await this.getRedisClient().set(
      this.formatCacheKey(key),
      JSON.stringify(data),
      'EX',
      ttl,
    );
  }

  /**
   * Attempts to acquire a lock for the idempotency key.
   * @param key - The idempotency key.
   * @param ttl - Lock expiration time in seconds.
   * @returns True if lock was acquired, false otherwise.
   */
  async acquireLock(key: string, ttl: number): Promise<boolean> {
    const result = await this.getRedisClient().set(
      this.formatLockKey(key),
      'LOCKED',
      'EX',
      ttl,
      'NX',
    );
    // set with NX returns 'OK' on success, null if key already exists
    return result === 'OK';
  }

  /**
   * Releases a previously acquired lock.
   * @param key - The idempotency key.
   */
  async releaseLock(key: string): Promise<void> {
    await this.getRedisClient().del(this.formatLockKey(key));
  }

  /**
   * Formats a key for cache storage
   * @private
   */
  private formatCacheKey(key: string): string {
    return `${IDEMPOTENCY_KEY_PREFIX}${key}`;
  }

  /**
   * Formats a key for lock management
   * @private
   */
  private formatLockKey(key: string): string {
    return `${IDEMPOTENCY_LOCK_PREFIX}${key}`;
  }

  /**
   * Gets the Redis client instance
   * @private
   */
  private getRedisClient() {
    return this.redis.getOrThrow();
  }
}
