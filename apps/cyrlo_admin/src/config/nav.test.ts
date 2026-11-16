import { describe, expect, it } from 'vitest';

import { canAccessPath, navItemsForRole } from './nav';

describe('role-aware navigation', () => {
  it('shows finance items for FINANCE_ADMIN but not riders', () => {
    const items = navItemsForRole('FINANCE_ADMIN').map((i) => i.id);
    expect(items).toContain('finance');
    expect(items).toContain('overview');
    expect(items).not.toContain('riders');
    expect(items).not.toContain('passengers');
    expect(items).not.toContain('admins');
  });

  it('shows passengers and bookings for SUPPORT_ADMIN but not execute-finance packages', () => {
    const items = navItemsForRole('SUPPORT_ADMIN').map((i) => i.id);
    expect(items).toContain('passengers');
    expect(items).toContain('bookings');
    expect(items).toContain('support');
    expect(items).not.toContain('admins');
  });

  it('blocks finance path for OPERATIONS_ADMIN', () => {
    expect(canAccessPath('OPERATIONS_ADMIN', '/finance')).toBe(false);
    expect(canAccessPath('OPERATIONS_ADMIN', '/riders')).toBe(true);
  });

  it('inherits ReviewRiders for nested rider profile paths', () => {
    expect(canAccessPath('OPERATIONS_ADMIN', '/riders/11111111-1111-1111-1111-111111111111')).toBe(
      true,
    );
    expect(canAccessPath('SUPPORT_ADMIN', '/riders/11111111-1111-1111-1111-111111111111')).toBe(
      false,
    );
    expect(canAccessPath('FINANCE_ADMIN', '/riders')).toBe(false);
  });

  it('inherits ViewBookingHistory for nested passenger profile paths', () => {
    expect(
      canAccessPath('OPERATIONS_ADMIN', '/passengers/11111111-1111-1111-1111-111111111111'),
    ).toBe(true);
    expect(
      canAccessPath('SUPPORT_ADMIN', '/passengers/11111111-1111-1111-1111-111111111111'),
    ).toBe(true);
    expect(canAccessPath('FINANCE_ADMIN', '/passengers')).toBe(false);
    expect(
      canAccessPath('FINANCE_ADMIN', '/passengers/11111111-1111-1111-1111-111111111111'),
    ).toBe(false);
  });

  it('inherits ViewBookingHistory for nested booking detail paths', () => {
    expect(canAccessPath('OPERATIONS_ADMIN', '/bookings')).toBe(true);
    expect(canAccessPath('SUPPORT_ADMIN', '/bookings')).toBe(true);
    expect(
      canAccessPath('OPERATIONS_ADMIN', '/bookings/22222222-2222-2222-2222-222222222222'),
    ).toBe(true);
    expect(
      canAccessPath('SUPPORT_ADMIN', '/bookings/22222222-2222-2222-2222-222222222222'),
    ).toBe(true);
    expect(canAccessPath('FINANCE_ADMIN', '/bookings')).toBe(false);
    expect(
      canAccessPath('FINANCE_ADMIN', '/bookings/22222222-2222-2222-2222-222222222222'),
    ).toBe(false);
    expect(navItemsForRole('FINANCE_ADMIN').map((i) => i.id)).not.toContain('bookings');
  });

  it('gates applications queue and detail to ReviewRiders', () => {
    expect(canAccessPath('OPERATIONS_ADMIN', '/applications')).toBe(true);
    expect(
      canAccessPath('OPERATIONS_ADMIN', '/applications/11111111-1111-1111-1111-111111111111'),
    ).toBe(true);
    expect(canAccessPath('SUPPORT_ADMIN', '/applications')).toBe(false);
    expect(navItemsForRole('OPERATIONS_ADMIN').map((i) => i.id)).toContain('applications');
    expect(navItemsForRole('FINANCE_ADMIN').map((i) => i.id)).not.toContain('applications');
  });

  it('allows nested finance paths for finance and support viewers but not operations', () => {
    expect(canAccessPath('FINANCE_ADMIN', '/finance/refunds')).toBe(true);
    expect(canAccessPath('SUPPORT_ADMIN', '/finance/refunds')).toBe(true);
    expect(canAccessPath('SUPER_ADMIN', '/finance/ledgers')).toBe(true);
    expect(canAccessPath('OPERATIONS_ADMIN', '/finance/refunds')).toBe(false);
  });

  it('gates /reports to operations, finance, and payment viewers', () => {
    expect(canAccessPath('OPERATIONS_ADMIN', '/reports')).toBe(true);
    expect(canAccessPath('FINANCE_ADMIN', '/reports')).toBe(true);
    expect(canAccessPath('SUPPORT_ADMIN', '/reports')).toBe(true);
    expect(canAccessPath('SUPER_ADMIN', '/reports')).toBe(true);
    expect(navItemsForRole('FINANCE_ADMIN').map((i) => i.id)).toContain('reports');
    expect(navItemsForRole('OPERATIONS_ADMIN').map((i) => i.id)).toContain('reports');
  });

  it('shows the Ashanti map to zone managers and geo viewers only', () => {
    expect(navItemsForRole('OPERATIONS_ADMIN').map((i) => i.id)).toContain('ashanti-map');
    expect(navItemsForRole('FINANCE_ADMIN').map((i) => i.id)).toContain('ashanti-map');
    expect(canAccessPath('SUPPORT_ADMIN', '/zones/ashanti-map')).toBe(true);
    expect(canAccessPath('SUPER_ADMIN', '/zones/ashanti-map')).toBe(true);
  });

  it('allows audit only for SUPER_ADMIN via ManageAdmins', () => {
    expect(canAccessPath('SUPER_ADMIN', '/audit')).toBe(true);
    expect(canAccessPath('SUPPORT_ADMIN', '/audit')).toBe(false);
  });
});
