import { z } from 'zod';

import { ghanaPhoneSchema } from '../../common/schemas/phone.js';

export const staffRoleSchema = z.enum([
  'SUPER_ADMIN',
  'OPERATIONS_ADMIN',
  'FINANCE_ADMIN',
  'SUPPORT_ADMIN',
]);

export const bootstrapAdminSchema = z
  .object({
    bootstrapSecret: z.string().min(32),
    phoneNumber: ghanaPhoneSchema,
    displayName: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

export const createInvitationSchema = z
  .object({
    phoneNumber: ghanaPhoneSchema,
    staffRole: staffRoleSchema,
  })
  .strict();

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(20),
  })
  .strict();

export const adminOtpRequestSchema = z
  .object({
    phoneNumber: ghanaPhoneSchema,
  })
  .strict();

export const adminOtpVerifySchema = z
  .object({
    phoneNumber: ghanaPhoneSchema,
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const adminMfaConfirmSchema = z
  .object({
    code: z.string().regex(/^\d{6}$/),
  })
  .strict();

export const adminMfaVerifySchema = z
  .object({
    mfaToken: z.string().min(20),
    code: z.string().regex(/^\d{6}$/).optional(),
    recoveryCode: z.string().min(8).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode), {
    message: 'Provide either code or recoveryCode',
  });

export const revokeAdminSchema = z
  .object({
    userId: z.string().uuid(),
    reason: z.string().trim().min(2).max(200),
  })
  .strict();

/** Kept for future rider-review milestone wiring; not registered in M2 routes. */
export const reviewRiderSchema = z
  .object({
    riderId: z.string().uuid(),
    decision: z.enum(['APPROVED', 'REJECTED']),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export const suspendUserSchema = z
  .object({
    userId: z.string().uuid(),
    reason: z.string().trim().min(2).max(200),
  })
  .strict();

/** Same shape as suspend — mandatory reason + audited reinstate. */
export const reinstateUserSchema = suspendUserSchema;

export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type AdminOtpRequestInput = z.infer<typeof adminOtpRequestSchema>;
export type AdminOtpVerifyInput = z.infer<typeof adminOtpVerifySchema>;
export type AdminMfaConfirmInput = z.infer<typeof adminMfaConfirmSchema>;
export type AdminMfaVerifyInput = z.infer<typeof adminMfaVerifySchema>;
export type RevokeAdminInput = z.infer<typeof revokeAdminSchema>;
export type ReviewRiderInput = z.infer<typeof reviewRiderSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
export type ReinstateUserInput = z.infer<typeof reinstateUserSchema>;
