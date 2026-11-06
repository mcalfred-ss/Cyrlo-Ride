import { z } from 'zod';

export const submitRiderOnboardingSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  vehicleRegistration: z.string().trim().min(2).max(20),
  vehicleDescription: z.string().trim().min(2).max(120),
}).strict();
export const updateAvailabilitySchema = z.object({
  availability: z.enum(['OFFLINE', 'AVAILABLE']),
}).strict();
export type SubmitRiderOnboardingInput = z.infer<typeof submitRiderOnboardingSchema>;
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
