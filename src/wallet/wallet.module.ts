import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from './entities/transaction.entity';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { BullModule } from '@nestjs/bullmq';
import { TransactionProcessor } from './transaction.processor';

/**
 * Module for managing wallet-related functionality.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction]),
    BullModule.forRoot({
      connection: {
        host: 'redis',
        port: 6379,
      },
    }),
    BullModule.registerQueue({
      name: 'transaction-queue',
    }),
  ],
  controllers: [WalletController],
  providers: [WalletService, TransactionProcessor],
})
export class WalletModule {}
