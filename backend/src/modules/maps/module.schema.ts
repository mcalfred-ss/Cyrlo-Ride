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

export const placeSearchBodySchema = z
  .object({
    text: z.string().trim().min(1).max(256),
    limit: z.coerce.number().int().min(1).max(10).optional(),
    bias: coordinateSchema.optional(),
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
