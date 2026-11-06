import { z } from 'zod';

export const latitudeSchema = z.number().gte(-90).lte(90);
export const longitudeSchema = z.number().gte(-180).lte(180);

export const coordinatesSchema = z
  .object({
    latitude: latitudeSchema,
    longitude: longitudeSchema,
  })
  .strict();

export type Coordinates = z.infer<typeof coordinatesSchema>;
