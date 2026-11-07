import { z } from 'zod';

export const offerIdParamSchema = z.object({ offerId: z.string().uuid() }).strict();
export const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() }).strict();

/** Legacy schema retained for older contract notes; routes use offerId. */
export const offerResponseSchema = z.object({ bookingId: z.string().uuid() }).strict();
export type OfferResponseInput = z.infer<typeof offerResponseSchema>;
