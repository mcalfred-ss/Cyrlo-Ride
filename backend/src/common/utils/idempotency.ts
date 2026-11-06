export const IdempotencyKey = {
  bookingFee: (bookingId: string) => `booking-fee:${bookingId}`,
  tokenPurchase: (paymentId: string) => `token-purchase:${paymentId}`,
  tokenDebit: (bookingId: string) => `token-debit:booking:${bookingId}`,
  tokenRefund: (bookingId: string) => `token-refund:booking:${bookingId}`,
} as const;
