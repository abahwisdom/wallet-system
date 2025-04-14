import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Transaction } from './transaction.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
export class Wallet {
  @ApiProperty({ description: 'The unique identifier of the wallet' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'The current balance of the wallet' })
  @Column({ type: 'int', default: 0 })
  balance: number;

  @ApiProperty({
    description: 'The list of transactions associated with the wallet',
    type: () => [Transaction],
  })
  @OneToMany(() => Transaction, (transaction) => transaction.wallet)
  transactions: Transaction[];
}
