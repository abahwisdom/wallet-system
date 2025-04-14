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
import { Observable } from 'rxjs';
import { map, filter } from 'rxjs/operators';
import { transactionStatusSubject } from './wallet.utils';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { TransactionDto } from './dto/transaction.dto';
import { TransferDto } from './dto/transfer.dto';
import { ApiBody } from '@nestjs/swagger';

const logger = new Logger('WalletController');

/**
 * Controller for handling wallet-related API endpoints.
 */
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  /**
   * Creates a new wallet.
   * @param createWalletDto - The DTO containing the initial balance.
   * @returns The created wallet.
   */
  @Post()
  @ApiBody({
    type: CreateWalletDto,
    required: false,
  })
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createWallet(@Body() createWalletDto?: CreateWalletDto) {
    return this.walletService.createWallet(createWalletDto.initialBalance);
  }

  /**
   * Deposits funds into a wallet.
   * @param id - The ID of the wallet.
   * @param transactionDto - The DTO containing the deposit amount.
   * @returns A message and the job ID of the deposit transaction.
   */
  @Post(':id/deposit')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async deposit(
    @Param('id') id: string,
    @Body() transactionDto: TransactionDto,
  ) {
    return this.walletService.deposit(id, transactionDto.amount);
  }

  /**
   * Withdraws funds from a wallet.
   * @param id - The ID of the wallet.
   * @param transactionDto - The DTO containing the withdrawal amount.
   * @returns A message and the job ID of the withdrawal transaction.
   */
  @Post(':id/withdraw')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async withdraw(
    @Param('id') id: string,
    @Body() transactionDto: TransactionDto,
  ) {
    return this.walletService.withdraw(id, transactionDto.amount);
  }

  /**
   * Transfers funds between wallets.
   * @param fromId - The ID of the sender's wallet.
   * @param toId - The ID of the recipient's wallet.
   * @param transferDto - The DTO containing the transfer amount.
   * @param idempotencyKey - The idempotency key for the request.
   * @returns A message and the job ID of the transfer transaction.
   */
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

  /**
   * Retrieves transaction history for a wallet.
   * @param walletId - The ID of the wallet.
   * @param page - The page number (default: 1).
   * @param limit - The number of transactions per page (default: 10).
   * @param type - Optional filter for transaction type.
   * @returns The transaction history and metadata.
   */
  @Get(':id/transactions')
  async getTransactionHistory(
    @Param('id') walletId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Query('type')
    type?:
      | 'deposit'
      | 'withdrawal'
      | 'transfer_in'
      | 'transfer_out'
      | 'transfer',
  ) {
    const { data, meta } = await this.walletService.getTransactionHistory(
      walletId,
      page,
      limit,
      type,
    );

    return {
      data,
      meta,
    };
  }

  /**
   * Streams transaction status updates for a wallet.
   * @param walletId - The ID of the wallet.
   * @returns An observable stream of transaction status updates.
   */
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
