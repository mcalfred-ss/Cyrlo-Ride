import { notImplemented } from '../../common/errors/not-implemented.js';
import type { WalletMovementInput } from './module.schema.js';
import type { WalletRepository } from './module.repository.js';

export interface WalletService {
  getBalance(): Promise<never>;
  creditPurchase(input: WalletMovementInput): Promise<never>;
  debitForAcceptance(input: WalletMovementInput): Promise<never>;
  refundForBooking(input: WalletMovementInput): Promise<never>;
}

export class WalletServiceImpl implements WalletService {
  constructor(private readonly repository: WalletRepository) {}

  async getBalance(): Promise<never> {
    notImplemented('getBalance');
  }

  async creditPurchase(_input: WalletMovementInput): Promise<never> {
    notImplemented('creditPurchase');
  }

  async debitForAcceptance(_input: WalletMovementInput): Promise<never> {
    notImplemented('debitForAcceptance');
  }

  async refundForBooking(_input: WalletMovementInput): Promise<never> {
    notImplemented('refundForBooking');
  }
}
