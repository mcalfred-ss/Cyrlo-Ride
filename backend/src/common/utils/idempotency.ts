export const IdempotencyKey = {
  bookingFee: (bookingId: string) => `booking-fee:${bookingId}`,
  /** Ledger PURCHASE credit for a paid token package payment. */
  tokenPurchase: (paymentId: string) => `token-purchase:${paymentId}`,
  /** Payment/purchase initialization idempotency (client-supplied request id). */
  tokenPurchaseInit: (riderId: string, clientRequestId: string) =>
    `token-purchase-init:${riderId}:${clientRequestId}`,
  tokenDebit: (bookingId: string) => `token-debit:booking:${bookingId}`,
  tokenRefund: (bookingId: string) => `token-refund:booking:${bookingId}`,
  bookingFeeRefund: (paymentId: string, attempt = 1) =>
    attempt === 1
      ? `booking-fee-refund:${paymentId}`
      : `booking-fee-refund:${paymentId}:attempt:${attempt}`,
} as const;
