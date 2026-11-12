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

  it('allows audit only for SUPER_ADMIN via ManageAdmins', () => {
    expect(canAccessPath('SUPER_ADMIN', '/audit')).toBe(true);
    expect(canAccessPath('SUPPORT_ADMIN', '/audit')).toBe(false);
  });
});
