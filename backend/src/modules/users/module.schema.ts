import { z } from 'zod';

export const updatePassengerProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
}).strict();
export type UpdatePassengerProfileInput = z.infer<typeof updatePassengerProfileSchema>;
