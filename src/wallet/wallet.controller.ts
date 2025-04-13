import {
  BadRequestException,
  Controller,
  Post,
  Body,
  Param,
  Get,
  Query,
  Headers,
  UsePipes,
  ValidationPipe,
  Sse,
  Logger,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { IsNumber, IsPositive } from 'class-validator';
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { transactionStatusSubject } from './wallet.utils';

export class CreateWalletDto {
  @IsNumber()
  @IsPositive()
  initialBalance: number;
}

export class TransactionDto {
  @IsNumber()
  @IsPositive()
  amount: number;
}

export class TransferDto {
  @IsNumber()
  @IsPositive()
  amount: number;
}

const logger = new Logger('WalletController');

@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createWallet(@Body() createWalletDto: CreateWalletDto) {
    return this.walletService.createWallet(createWalletDto.initialBalance);
  }

  @Post(':id/deposit')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async deposit(
    @Param('id') id: string,
    @Body() transactionDto: TransactionDto,
  ) {
    return this.walletService.deposit(id, transactionDto.amount);
  }

  @Post(':id/withdraw')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async withdraw(
    @Param('id') id: string,
    @Body() transactionDto: TransactionDto,
  ) {
    return this.walletService.withdraw(id, transactionDto.amount);
  }

  @Post(':fromId/transfer/:toId')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async transfer(
    @Param('fromId') fromId: string,
    @Param('toId') toId: string,
    @Body() transferDto: TransferDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return this.walletService.transfer(fromId, toId, transferDto.amount);
  }

  @Get(':id/transactions')
  async getTransactionHistory(
    @Param('id') id: string,
    @Query('page') page: number,
    @Query('limit') limit: number,
  ) {
    return this.walletService.getTransactionHistory(id, page, limit);
  }

  @Sse('transactions/status/:walletId')
  streamTransactionStatus(
    @Param('walletId') walletId: string,
  ): Observable<{ data: any }> {
    logger.log(
      `Client connected to streamTransactionStatus with walletId: ${walletId}`,
    );
    return transactionStatusSubject.asObservable().pipe(
      filter((statusUpdate) => {
        const matches = statusUpdate.walletId === walletId;
        if (matches) {
          logger.log(`Streaming update for walletId: ${statusUpdate.walletId}`);
        }
        return matches;
      }),
      map((statusUpdate) => ({ data: statusUpdate })),
    );
  }
}
