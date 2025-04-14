import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { Wallet } from './wallet.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity()
@Index(['walletId', 'toWalletId', 'type'])
export class Transaction {
  @ApiProperty({ description: 'The unique identifier of the transaction' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'The amount involved in the transaction' })
  @Column({ type: 'int' })
  amount: number;

  @ApiProperty({
    description: 'The type of transaction',
    enum: ['deposit', 'withdrawal', 'transfer'],
  })
  @Column()
  type: 'deposit' | 'withdrawal' | 'transfer';

  @ApiProperty({
    description: 'The status of the transaction',
    enum: ['pending', 'completed', 'failed'],
  })
  @Column({ default: 'completed' })
  status: 'pending' | 'completed' | 'failed';

  @ApiProperty({ description: 'The wallet that initiated the transaction' })
  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @ApiProperty({
    description: 'The ID of the wallet that initiated the transaction',
  })
  @Column()
  walletId: string;

  @ApiProperty({
    description: 'The destination wallet (only for transfers)',
    nullable: true,
  })
  @ManyToOne(() => Wallet, { nullable: true })
  @JoinColumn({ name: 'toWalletId' })
  toWallet?: Wallet;

  @ApiProperty({
    description: 'The ID of the destination wallet (only for transfers)',
    nullable: true,
  })
  @Column({ nullable: true })
  toWalletId?: string;

  @ApiProperty({
    description: 'The timestamp when the transaction was created',
  })
  @CreateDateColumn()
  createdAt: Date;
}
