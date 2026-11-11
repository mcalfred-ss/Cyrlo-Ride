import { z } from 'zod';

import { latitudeSchema, longitudeSchema } from '../../common/schemas/coordinates.js';

const coordinateSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();

export const geocodeBodySchema = z
  .object({
    query: z.string().trim().min(1).max(256),
    limit: z.coerce.number().int().min(1).max(10).optional(),
    bias: coordinateSchema.optional(),
  })
  .strict();

export const reverseGeocodeBodySchema = coordinateSchema;

/** Passenger destination search defaults — Ghana-only at the Ride proxy. */
export const PASSENGER_DESTINATION_COUNTRY = 'GH' as const;

export const PASSENGER_DESTINATION_PLACE_TYPES = [
  'poi',
  'landmark',
  'address',
  'street',
  'place',
  'locality',
  'neighborhood',
] as const;

export const placeSearchBodySchema = z
  .object({
    text: z.string().trim().min(1).max(256),
    limit: z.coerce.number().int().min(1).max(10).optional(),
    bias: coordinateSchema.optional(),
    /** Optional override; passenger destination search forces GH when omitted. */
    country: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .strict();

export const routeBodySchema = z
  .object({
    from: coordinateSchema,
    to: coordinateSchema,
  })
  .strict();

export type GeocodeBody = z.infer<typeof geocodeBodySchema>;
export type ReverseGeocodeBody = z.infer<typeof reverseGeocodeBodySchema>;
export type PlaceSearchBody = z.infer<typeof placeSearchBodySchema>;
export type RouteBody = z.infer<typeof routeBodySchema>;
