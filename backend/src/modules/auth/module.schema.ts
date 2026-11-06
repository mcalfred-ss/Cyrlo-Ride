import { z } from 'zod';
import { ghanaPhoneSchema } from '../../common/schemas/phone.js';

export const requestOtpSchema = z.object({ phoneNumber: ghanaPhoneSchema }).strict();
export const verifyOtpSchema = z.object({
  phoneNumber: ghanaPhoneSchema,
  code: z.string().regex(/^\d{6}$/),
  role: z.enum(['PASSENGER', 'RIDER']),
}).strict();
export const refreshSessionSchema = z.object({ refreshToken: z.string().min(20) }).strict();
export const logoutSchema = refreshSessionSchema;

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;
export type LogoutInput = RefreshSessionInput;
