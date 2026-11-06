import { z } from 'zod';
import { coordinatesSchema } from '../../common/schemas/coordinates.js';

export const createBookingSchema = z.object({
  pickup: coordinatesSchema,
  destination: coordinatesSchema,
  pickupLabel: z.string().trim().min(1).max(200).optional(),
  destinationLabel: z.string().trim().min(1).max(200).optional(),
}).strict();
export const bookingIdSchema = z.object({ bookingId: z.string().uuid() }).strict();
export const cancelBookingSchema = bookingIdSchema.extend({
  reason: z.string().trim().max(200).optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingIdInput = z.infer<typeof bookingIdSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
