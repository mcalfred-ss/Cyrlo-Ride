import { z } from 'zod';

export const purchasePackageSchema = z
  .object({
    packageCode: z.string().trim().min(1).max(40),
    /** Optional client idempotency key to safely retry initialization. */
    clientRequestId: z.string().trim().min(8).max(80).optional(),
  })
  .strict();

export const purchaseIdParamSchema = z.object({ purchaseId: z.string().uuid() }).strict();
export const packageIdParamSchema = z.object({ packageId: z.string().uuid() }).strict();

export const listPageQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
  })
  .strict();

export const createPackageSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[A-Z][A-Z0-9_]*$/, 'Package code must be uppercase alphanumeric'),
    name: z.string().trim().min(1).max(80),
    tokenQuantity: z.number().int().positive().max(100_000),
    pricePesewas: z.number().int().positive().max(10_000_000),
    currency: z.literal('GHS').default('GHS'),
    isActive: z.boolean().default(true),
    displayOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const updatePackageSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    tokenQuantity: z.number().int().positive().max(100_000).optional(),
    pricePesewas: z.number().int().positive().max(10_000_000).optional(),
    isActive: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export type PurchasePackageInput = z.infer<typeof purchasePackageSchema>;
export type CreatePackageInput = z.infer<typeof createPackageSchema>;
export type UpdatePackageInput = z.infer<typeof updatePackageSchema>;
export type ListPageQuery = z.infer<typeof listPageQuerySchema>;

/** @deprecated Legacy stub shape — purchase flow uses PurchasePackageInput. */
export interface WalletMovementInput {
  riderId: string;
  amount: number;
  reason: string;
}
