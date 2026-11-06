import { z } from 'zod';

export const initiateBookingFeeSchema = z.object({ bookingId: z.string().uuid() }).strict();
export const initiateTokenPurchaseSchema = z.object({ packCode: z.string().min(1).max(40) }).strict();
export type InitiateBookingFeeInput = z.infer<typeof initiateBookingFeeSchema>;
export type InitiateTokenPurchaseInput = z.infer<typeof initiateTokenPurchaseSchema>;
export interface PaystackWebhookInput {
  rawBody: Buffer;
  signature: string | undefined;
}
