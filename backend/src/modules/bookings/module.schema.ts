import { z } from 'zod';
import { coordinatesSchema } from '../../common/schemas/coordinates.js';

/**
 * Destination-free create contract.
 * Destination fields remain accepted for backward compatibility but are optional
 * and are not used for fare or routing by Cyrlo.
 */
export const createBookingSchema = z
  .object({
    pickup: coordinatesSchema,
    destination: coordinatesSchema.optional(),
    pickupLabel: z.string().trim().min(1).max(200).optional(),
    destinationLabel: z.string().trim().min(1).max(200).optional(),
    vehicleCategory: z.enum(['OKADA', 'PRAGYA', 'ABOBOYAA']),
  })
  .strict();

export const bookingIdSchema = z.object({ bookingId: z.string().uuid() }).strict();

export const cancelBookingSchema = z
  .object({
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

export const riderCancelSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const riderUnableToCompleteSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const passengerCancelAfterAcceptSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export const listBookingsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type BookingIdInput = z.infer<typeof bookingIdSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type RiderCancelInput = z.infer<typeof riderCancelSchema>;
export type RiderUnableToCompleteInput = z.infer<typeof riderUnableToCompleteSchema>;
export type PassengerCancelAfterAcceptInput = z.infer<typeof passengerCancelAfterAcceptSchema>;
export type ListBookingsQuery = z.infer<typeof listBookingsQuerySchema>;
