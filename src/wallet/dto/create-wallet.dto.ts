import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsPositive } from 'class-validator';

export class CreateWalletDto {
  @ApiPropertyOptional({ description: 'The initial balance of the wallet' })
  @IsNumber()
  @IsOptional()
  @IsPositive()
  initialBalance?: number;
}
