import { z } from 'zod';

import { paginationQuerySchema } from '../../common/utils/pagination.js';

export const analyticsQuerySchema = z
  .object({
    /**
     * Inclusive UTC start (ISO-8601). Applies to all period metrics
     * (bookings, fees, refunds, tokens) via createdAt. Snapshot metrics ignore this.
     */
    from: z.string().datetime().optional(),
    /** Inclusive UTC end (ISO-8601). Same semantics as `from`. */
    to: z.string().datetime().optional(),
  })
  .strict();

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const listPassengersQuerySchema = paginationQuerySchema
  .extend({
    q: z.string().trim().min(1).max(120).optional(),
    status: z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']).optional(),
  })
  .strict();

export type ListPassengersQuery = z.infer<typeof listPassengersQuerySchema>;

export const passengerIdParamSchema = z.object({ passengerId: z.string().uuid() }).strict();

export const listAdminBookingsQuerySchema = paginationQuerySchema
  .extend({
    status: z
      .enum([
        'AWAITING_PAYMENT',
        'PAYMENT_FAILED',
        'SEARCHING',
        'ACCEPTED',
        'IN_PROGRESS',
        'COMPLETED',
        'EXPIRED',
        'CANCELLED',
      ])
      .optional(),
    passengerId: z.string().uuid().optional(),
    riderId: z.string().uuid().optional(),
    serviceZoneId: z.string().uuid().optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict();

export type ListAdminBookingsQuery = z.infer<typeof listAdminBookingsQuerySchema>;

export const adminBookingIdParamSchema = z.object({ bookingId: z.string().uuid() }).strict();

export const listAuditLogsQuerySchema = paginationQuerySchema
  .extend({
    actorId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    entityId: z.string().trim().min(1).max(80).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  })
  .strict();

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
