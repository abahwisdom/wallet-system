import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive } from 'class-validator';

export class TransferDto {
  @ApiProperty({ description: 'The amount to transfer between wallets' })
  @IsNumber()
  @IsPositive()
  amount: number;
}
