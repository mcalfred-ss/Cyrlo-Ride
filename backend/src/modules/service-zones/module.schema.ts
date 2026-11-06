import { z } from 'zod';
import { latitudeSchema, longitudeSchema } from '../../common/schemas/coordinates.js';

export const boundingBoxSchema = z.object({
  minLatitude: latitudeSchema,
  maxLatitude: latitudeSchema,
  minLongitude: longitudeSchema,
  maxLongitude: longitudeSchema,
}).strict().refine(
  (box) => box.minLatitude <= box.maxLatitude && box.minLongitude <= box.maxLongitude,
  { message: 'Bounding box minimums must not exceed maximums' },
);
export interface AssertPickupInput {
  latitude: number;
  longitude: number;
}
