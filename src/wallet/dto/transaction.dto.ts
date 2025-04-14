import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class TransactionDto {
  @ApiProperty({ description: 'The amount for the transaction' })
  @IsNumber()
  @IsPositive()
  amount: number;
}
