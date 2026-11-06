export interface WalletMovementInput {
  riderId: string;
  bookingId?: string;
  paymentId?: string;
  idempotencyKey: string;
}
