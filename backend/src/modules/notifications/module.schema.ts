import { z } from 'zod';

export const listNotificationsQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    category: z.string().trim().min(1).max(40).optional(),
    unreadOnly: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  })
  .strict();

export const notificationIdParamSchema = z
  .object({ notificationId: z.string().uuid() })
  .strict();

export const registerDeviceSchema = z
  .object({
    token: z.string().trim().min(16).max(512),
    platform: z.enum(['ANDROID', 'IOS', 'WEB']),
    provider: z.enum(['FCM', 'APNS']).default('FCM'),
  })
  .strict();

export const updateDeviceSchema = z
  .object({
    token: z.string().trim().min(16).max(512).optional(),
    platform: z.enum(['ANDROID', 'IOS', 'WEB']).optional(),
    provider: z.enum(['FCM', 'APNS']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field required' });

export const deviceIdParamSchema = z.object({ deviceId: z.string().uuid() }).strict();

export const updatePreferencesSchema = z
  .object({
    pushEnabled: z.boolean().optional(),
    optionalSmsEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field required' });

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

/** @deprecated */
export type MarkReadInput = { notificationId: string };
