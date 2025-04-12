import { Global, Module } from '@nestjs/common';
import { IdempotencyInterceptor } from './interceptors/idempotency.interceptor';
import { IdempotencyRedisService } from './services/idempotency-redis.service';

@Global()
@Module({
  providers: [IdempotencyRedisService, IdempotencyInterceptor],
  exports: [IdempotencyRedisService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
