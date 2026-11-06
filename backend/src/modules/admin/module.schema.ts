import { z } from 'zod';

export const reviewRiderSchema = z.object({
  riderId: z.string().uuid(),
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().trim().max(500).optional(),
}).strict();
export const suspendUserSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(2).max(200),
}).strict();
export type ReviewRiderInput = z.infer<typeof reviewRiderSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
