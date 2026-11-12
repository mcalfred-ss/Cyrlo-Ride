import { z } from 'zod';

import { latitudeSchema, longitudeSchema } from '../../common/schemas/coordinates.js';

export const offerIdParamSchema = z.object({ offerId: z.string().uuid() }).strict();
export const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() }).strict();

/** Legacy schema retained for older contract notes; routes use offerId. */
export const offerResponseSchema = z.object({ bookingId: z.string().uuid() }).strict();
export type OfferResponseInput = z.infer<typeof offerResponseSchema>;

export const nearbyDiscoveryBodySchema = z
  .object({
    pickup: z
      .object({
        latitude: latitudeSchema,
        longitude: longitudeSchema,
      })
      .strict(),
    vehicleCategory: z.enum(['OKADA', 'PRAGYA', 'ABOBOYAA']).default('PRAGYA'),
    limit: z.number().int().min(1).max(30).optional(),
  })
  .strict();

export type NearbyDiscoveryBody = z.infer<typeof nearbyDiscoveryBodySchema>;
