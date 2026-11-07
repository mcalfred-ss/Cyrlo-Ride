import { z } from 'zod';

export const createDisputeSchema = z
  .object({
    category: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(2000),
  })
  .strict();

export const bookingIdParamSchema = z.object({ bookingId: z.string().uuid() }).strict();
export const disputeIdParamSchema = z.object({ disputeId: z.string().uuid() }).strict();
export const cancellationRequestIdParamSchema = z
  .object({ requestId: z.string().uuid() })
  .strict();

export const supportRecommendationSchema = z
  .object({
    recommendation: z.enum(['REFUND_FEE', 'NO_REFUND', 'ESCALATE']),
    notes: z.string().trim().max(2000).optional(),
    /** When resolving a passenger cancel request, optionally cancel the booking without auto money movement. */
    cancelBooking: z.boolean().optional(),
  })
  .strict();

export const listDisputesQuerySchema = z
  .object({
    status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED', 'ESCALATED']).optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;
export type SupportRecommendationInput = z.infer<typeof supportRecommendationSchema>;
export type ListDisputesQuery = z.infer<typeof listDisputesQuerySchema>;
