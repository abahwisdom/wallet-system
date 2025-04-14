// src/app.module.ts
import { Module } from '@nestjs/common';
import { WalletModule } from './wallet/wallet.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { IdempotencyInterceptor, IdempotencyModule } from './idempotency';
import { APP_INTERCEPTOR, APP_GUARD } from '@nestjs/core';
import { RedisModule, RedisService } from '@liaoliaots/nestjs-redis';
import { ThrottlerModule, ThrottlerGuard, seconds } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    WalletModule,
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT, 10),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      synchronize: true,
    }),
    IdempotencyModule,
    RedisModule.forRoot({
      config: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: async (redisService: RedisService) => {
        const redisClient = redisService.getOrThrow(); // get the default Redis client
        return {
          throttlers: [
            {
              ttl: seconds(60),
              limit: 10,
            },
          ],
          storage: new ThrottlerStorageRedisService(redisClient),
        };
      },
    }),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: IdempotencyInterceptor,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
