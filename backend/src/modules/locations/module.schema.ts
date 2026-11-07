import { z } from 'zod';
import { latitudeSchema, longitudeSchema } from '../../common/schemas/coordinates.js';

export const updateLocationSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    accuracyMeters: z.number().positive().max(1000).optional(),
    heading: z.number().gte(0).lt(360).optional(),
    recordedAt: z.string().datetime(),
  })
  .strict();

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
