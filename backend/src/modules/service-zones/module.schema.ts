import { z } from 'zod';

import { latitudeSchema, longitudeSchema } from '../../common/schemas/coordinates.js';

export const boundingBoxSchema = z
  .object({
    minLatitude: latitudeSchema,
    maxLatitude: latitudeSchema,
    minLongitude: longitudeSchema,
    maxLongitude: longitudeSchema,
  })
  .strict()
  .refine((box) => box.minLatitude <= box.maxLatitude && box.minLongitude <= box.maxLongitude, {
    message: 'Bounding box minimums must not exceed maximums',
  });

const zoneSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase kebab-case');

/** Boundary is validated structurally in the service (Polygon / MultiPolygon). */
export const createServiceZoneSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    boundary: z.unknown(),
    communityId: z.string().uuid().optional(),
    slug: zoneSlugSchema.optional(),
    /**
     * Accepted by the schema only so the service can reject `true` with a clear VALIDATION_ERROR.
     * Zones are always created as DRAFT; activation is a separate, verified step.
     */
    activate: z.boolean().optional(),
  })
  .strict();

export const updateServiceZoneSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    boundary: z.unknown().optional(),
    communityId: z.string().uuid().nullable().optional(),
    slug: zoneSlugSchema.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const listServiceZonesQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    isActive: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => (value === undefined ? undefined : value === 'true')),
    status: z.enum(['DRAFT', 'UNDER_REVIEW', 'LOCKED', 'ACTIVE', 'SUSPENDED']).optional(),
    communityId: z.string().uuid().optional(),
    q: z.string().trim().max(120).optional(),
  })
  .strict();

export const assignRiderZoneSchema = z
  .object({
    riderId: z.string().uuid(),
  })
  .strict();

export const rejectOrRevokeZoneSchema = z
  .object({
    reason: z.string().trim().min(5).max(500),
  })
  .strict();

export interface AssertPickupInput {
  latitude: number;
  longitude: number;
}

export type CreateServiceZoneInput = z.infer<typeof createServiceZoneSchema>;
export type UpdateServiceZoneInput = z.infer<typeof updateServiceZoneSchema>;
export type ListServiceZonesQuery = z.infer<typeof listServiceZonesQuerySchema>;
export type AssignRiderZoneInput = z.infer<typeof assignRiderZoneSchema>;
export type RejectOrRevokeZoneInput = z.infer<typeof rejectOrRevokeZoneSchema>;
