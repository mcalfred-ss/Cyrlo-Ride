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

/** Passenger supply probe — count only, no rider identities or coordinates. */
export const supplyQuerySchema = z
  .object({
    vehicleCategory: z.enum(['OKADA', 'PRAGYA', 'ABOBOYAA']).default('PRAGYA'),
    latitude: z.coerce.number().gte(-90).lte(90),
    longitude: z.coerce.number().gte(-180).lte(180),
  })
  .strict();

export type SupplyQuery = z.infer<typeof supplyQuerySchema>;
