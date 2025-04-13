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

@Entity()
@Index(['walletId', 'toWalletId', 'type'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  amount: number;

  @Column()
  type: 'deposit' | 'withdrawal' | 'transfer';

  @Column({ default: 'completed' })
  status: 'pending' | 'completed' | 'failed';

  // Wallet that initiated the transaction (owner of this transaction)
  @ManyToOne(() => Wallet, (wallet) => wallet.transactions)
  @JoinColumn({ name: 'walletId' })
  wallet: Wallet;

  @Column()
  walletId: string;

  // Destination wallet (only for transfers)
  @ManyToOne(() => Wallet, { nullable: true })
  @JoinColumn({ name: 'toWalletId' })
  toWallet?: Wallet;

  @Column({ nullable: true })
  toWalletId?: string;

  @CreateDateColumn()
  createdAt: Date;
}
