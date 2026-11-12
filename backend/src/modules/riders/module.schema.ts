import { z } from 'zod';

import { paginationQuerySchema } from '../../common/utils/pagination.js';

export const vehicleCategorySchema = z.enum(['OKADA', 'PRAGYA', 'ABOBOYAA']);

/** Admin rider directory — ReviewRiders. Mirrors passenger list pagination/search. */
export const listAdminRidersQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(120).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
    verificationStatus: z
      .enum(['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'])
      .optional(),
    availability: z.enum(['OFFLINE', 'AVAILABLE', 'BUSY']).optional(),
  })
  .strict();

export type ListAdminRidersQuery = z.infer<typeof listAdminRidersQuerySchema>;

export const adminRiderIdParamSchema = z.object({ riderId: z.string().uuid() }).strict();

export function maxCapacityForCategory(category: z.infer<typeof vehicleCategorySchema>): number {
  return category === 'OKADA' ? 1 : 4;
}

export const startRiderOnboardingSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    driversLicenceNumber: z.string().trim().min(5).max(40).optional(),
    driversLicenceExpiry: z.string().datetime().optional(),
    ghanaCardNumber: z
      .string()
      .trim()
      .regex(/^GHA-\d{9}-\d$/, 'Ghana Card must look like GHA-XXXXXXXXX-X')
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasGhana = Boolean(value.ghanaCardNumber);
    const hasLicenceNumber = Boolean(value.driversLicenceNumber);
    const hasLicenceExpiry = Boolean(value.driversLicenceExpiry);
    if (hasLicenceNumber !== hasLicenceExpiry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Driver's licence number and expiry are both required",
        path: hasLicenceNumber ? ['driversLicenceExpiry'] : ['driversLicenceNumber'],
      });
    }
    if (!hasGhana && !(hasLicenceNumber && hasLicenceExpiry)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either Ghana Card or driver's licence details",
        path: ['ghanaCardNumber'],
      });
    }
  });

export const updateRiderOnboardingSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    driversLicenceNumber: z.string().trim().min(5).max(40).optional(),
    driversLicenceExpiry: z.string().datetime().optional(),
    ghanaCardNumber: z
      .string()
      .trim()
      .regex(/^GHA-\d{9}-\d$/, 'Ghana Card must look like GHA-XXXXXXXXX-X')
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const createVehicleSchema = z
  .object({
    category: vehicleCategorySchema,
    registrationNumber: z.string().trim().min(2).max(20),
    make: z.string().trim().min(1).max(60),
    model: z.string().trim().min(1).max(60),
    colour: z.string().trim().min(1).max(40),
    capacity: z.number().int(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const max = maxCapacityForCategory(value.category);
    const min = 1;
    if (value.capacity < min || value.capacity > max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capacity'],
        message: `Capacity for ${value.category} must be between ${min} and ${max}`,
      });
    }
  });

export const updateVehicleSchema = z
  .object({
    category: vehicleCategorySchema.optional(),
    registrationNumber: z.string().trim().min(2).max(20).optional(),
    make: z.string().trim().min(1).max(60).optional(),
    model: z.string().trim().min(1).max(60).optional(),
    colour: z.string().trim().min(1).max(40).optional(),
    capacity: z.number().int().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const documentKindSchema = z.enum([
  'GHANA_CARD',
  'RIDER_PHOTO',
  'VEHICLE_PHOTO',
  'DRIVERS_LICENCE',
  'VEHICLE_REGISTRATION',
  'ROADWORTHINESS',
  'INSURANCE',
]);

export const reviewRiderSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().min(5).max(500).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.decision === 'REJECTED' && (!value.reason || value.reason.length < 5)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'Rejection reason is required',
      });
    }
  });

export const reviewVehicleSchema = reviewRiderSchema;

export const updateAvailabilitySchema = z
  .object({
    availability: z.enum(['OFFLINE', 'AVAILABLE']),
  })
  .strict();

export type StartRiderOnboardingInput = z.infer<typeof startRiderOnboardingSchema>;
export type UpdateRiderOnboardingInput = z.infer<typeof updateRiderOnboardingSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type ReviewRiderInput = z.infer<typeof reviewRiderSchema>;
export type ReviewVehicleInput = z.infer<typeof reviewVehicleSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
export type DocumentKind = z.infer<typeof documentKindSchema>;
