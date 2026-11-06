import type { WalletService } from './module.service.js';

export class WalletController {
  constructor(private readonly service: WalletService) {}
}
