import { z } from 'zod';

export const offerResponseSchema = z.object({ bookingId: z.string().uuid() }).strict();
export type OfferResponseInput = z.infer<typeof offerResponseSchema>;
