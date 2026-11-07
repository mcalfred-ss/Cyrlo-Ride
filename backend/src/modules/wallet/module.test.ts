import { describe, expect, it } from 'vitest';

import { staffRoleHasPermission, Permission } from '../../common/authz/permissions.js';
import { IdempotencyKey } from '../../common/utils/idempotency.js';
import { createPackageSchema, purchasePackageSchema, updatePackageSchema } from './module.schema.js';

describe('token package permissions', () => {
  it('allows Finance/Super to manage packages; blocks Ops and Support', () => {
    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.ManageTokenPackages)).toBe(true);
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.ManageTokenPackages)).toBe(true);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ManageTokenPackages)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ManageTokenPackages)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ExecuteRefunds)).toBe(false);
  });
});

describe('wallet schemas', () => {
  it('rejects invalid package prices/quantities and accepts purchase by code only', () => {
    expect(() =>
      createPackageSchema.parse({
        code: 'X',
        name: 'Bad',
        tokenQuantity: 0,
        pricePesewas: 100,
      }),
    ).toThrow();
    expect(() =>
      createPackageSchema.parse({
        code: 'ok',
        name: 'Bad code case',
        tokenQuantity: 10,
        pricePesewas: 100,
      }),
    ).toThrow();
    expect(
      purchasePackageSchema.parse({ packageCode: 'STARTER' }),
    ).toEqual({ packageCode: 'STARTER' });
    expect(() =>
      purchasePackageSchema.parse({ packageCode: 'STARTER', pricePesewas: 1 }),
    ).toThrow();
    expect(
      updatePackageSchema.parse({ pricePesewas: 1500, isActive: false }),
    ).toMatchObject({ pricePesewas: 1500, isActive: false });
  });

  it('uses distinct idempotency keys for init vs ledger credit', () => {
    expect(IdempotencyKey.tokenPurchase('pay-1')).toBe('token-purchase:pay-1');
    expect(IdempotencyKey.tokenPurchaseInit('rider-1', 'req-abc')).toContain(
      'token-purchase-init:rider-1:req-abc',
    );
  });
});
