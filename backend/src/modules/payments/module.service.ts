import { notImplemented } from '../../common/errors/not-implemented.js';
import type { InitiateBookingFeeInput, InitiateTokenPurchaseInput, PaystackWebhookInput } from './module.schema.js';
import type { PaymentsRepository } from './module.repository.js';

export interface PaymentsService {
  initiateBookingFee(input: InitiateBookingFeeInput): Promise<never>;
  initiateTokenPurchase(input: InitiateTokenPurchaseInput): Promise<never>;
  handlePaystackWebhook(input: PaystackWebhookInput): Promise<never>;
}

export class PaymentsServiceImpl implements PaymentsService {
  constructor(private readonly repository: PaymentsRepository) {}

  async initiateBookingFee(_input: InitiateBookingFeeInput): Promise<never> {
    notImplemented('initiateBookingFee');
  }

  async initiateTokenPurchase(_input: InitiateTokenPurchaseInput): Promise<never> {
    notImplemented('initiateTokenPurchase');
  }

  async handlePaystackWebhook(_input: PaystackWebhookInput): Promise<never> {
    notImplemented('handlePaystackWebhook');
  }
}
