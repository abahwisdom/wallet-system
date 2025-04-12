import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Observable, of, tap, catchError, throwError } from 'rxjs';
import { IdempotencyRedisService } from '../services/idempotency-redis.service';
import {
  DEFAULT_IDEMPOTENCY_TTL,
  DEFAULT_LOCK_TTL,
} from '../constants/idempotency.constants';
import { Request, Response } from 'express';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(private readonly idempotencyService: IdempotencyRedisService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const method = req.method;
    const key = req.headers['idempotency-key'] as string;

    // 🧠 Only apply logic if it’s POST/PUT/... AND has the header
    const shouldHandle = ['POST', 'PUT', 'PATCH'].includes(method) && !!key;
    if (!shouldHandle) return next.handle();

    const cached = await this.idempotencyService.get(key);
    if (cached) {
      this.logger.log(`Returning cached response for key: ${key}`);
      res.status(cached.statusCode);
      return of(cached.body);
    }

    const locked = await this.idempotencyService.acquireLock(
      key,
      DEFAULT_LOCK_TTL,
    );
    if (!locked) {
      this.logger.warn(`Duplicate request in progress: ${key}`);
      throw new ConflictException('Duplicate request already in progress');
    }

    this.logger.log(`Processing new request with idempotency key: ${key}`);

    return next.handle().pipe(
      tap(async (responseData) => {
        await this.idempotencyService.set(
          key,
          {
            statusCode: res.statusCode,
            body: responseData,
          },
          DEFAULT_IDEMPOTENCY_TTL,
        );

        await this.idempotencyService.releaseLock(key);
        this.logger.log(`Cached response for key: ${key}`);
      }),
      catchError((err) => {
        this.logger.error(`Error during processing for key: ${key}`, err.stack);
        this.idempotencyService.releaseLock(key);
        return throwError(() => err);
      }),
    );
  }
}
