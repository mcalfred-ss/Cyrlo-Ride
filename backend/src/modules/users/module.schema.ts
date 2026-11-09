import { z } from 'zod';

const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'dateOfBirth must be a real calendar date');

export const updatePassengerProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    dateOfBirth: isoDateOnly,
    gender: z.enum(['MALE', 'FEMALE']),
    homeLocation: z.string().trim().min(2).max(200),
    homeLatitude: z.number().min(-90).max(90).optional().nullable(),
    homeLongitude: z.number().min(-180).max(180).optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const hasLat = value.homeLatitude != null;
    const hasLng = value.homeLongitude != null;
    if (hasLat !== hasLng) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'homeLatitude and homeLongitude must be provided together',
        path: ['homeLatitude'],
      });
    }

    const birth = new Date(`${value.dateOfBirth}T00:00:00.000Z`);
    const now = new Date();
    let age = now.getUTCFullYear() - birth.getUTCFullYear();
    const monthDelta = now.getUTCMonth() - birth.getUTCMonth();
    if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < birth.getUTCDate())) {
      age -= 1;
    }
    if (age < 16) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Passenger must be at least 16 years old',
        path: ['dateOfBirth'],
      });
    }
  });

export type UpdatePassengerProfileInput = z.infer<typeof updatePassengerProfileSchema>;
