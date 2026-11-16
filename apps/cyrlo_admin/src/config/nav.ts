import { Permission, staffRoleHasPermission, type StaffRole } from './permissions';

export interface NavItem {
  id: string;
  label: string;
  path: string;
  /** Any one of these permissions shows the item. */
  anyOf: readonly Permission[];
}

/**
 * Visibility mirrors ADMIN_ROLE_PERMISSION_MATRIX module access. Only Support remains a
 * placeholder screen. Finance (/finance/*) covers the financial report, refunds, reconciliation
 * cases, token packages/purchases/ledgers; mutations stay gated by ExecuteRefunds,
 * ReconcilePaystack and ManageTokenPackages (never granted to Support or Operations).
 */
export const NAV_ITEMS: readonly NavItem[] = [
  {
    id: 'home',
    label: 'Home',
    path: '/',
    anyOf: [Permission.ViewAdminProfile],
  },
  {
    id: 'overview',
    label: 'Overview',
    path: '/overview',
    anyOf: [
      Permission.MonitorOperations,
      Permission.ViewFinancialReports,
      Permission.InvestigateDisputes,
      Permission.ViewPayments,
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    anyOf: [
      Permission.MonitorOperations,
      Permission.ViewFinancialReports,
      Permission.ViewPayments,
    ],
  },
  {
    id: 'riders',
    label: 'Riders',
    path: '/riders',
    anyOf: [Permission.ReviewRiders],
  },
  {
    id: 'applications',
    label: 'Applications',
    path: '/applications',
    anyOf: [Permission.ReviewRiders],
  },
  {
    id: 'passengers',
    label: 'Passengers',
    path: '/passengers',
    anyOf: [Permission.ViewBookingHistory],
  },
  {
    id: 'bookings',
    label: 'Bookings',
    path: '/bookings',
    anyOf: [Permission.ViewBookingHistory],
  },
  {
    id: 'zones',
    label: 'Service zones',
    path: '/zones',
    anyOf: [Permission.ManageServiceZones, Permission.ViewGeoCoverage],
  },
  {
    id: 'ashanti-map',
    label: 'Ashanti map',
    path: '/zones/ashanti-map',
    anyOf: [Permission.ManageServiceZones, Permission.ViewGeoCoverage],
  },
  {
    id: 'geo',
    label: 'Geography',
    path: '/geo',
    anyOf: [Permission.ManageGeoHierarchy, Permission.ViewGeoCoverage],
  },
  {
    id: 'finance',
    label: 'Finance',
    path: '/finance',
    anyOf: [
      Permission.ViewPayments,
      Permission.ViewFinancialReports,
      Permission.ViewTokenLedgers,
      Permission.ManageTokenPackages,
    ],
  },
  {
    id: 'support',
    label: 'Support',
    path: '/support',
    anyOf: [Permission.InvestigateDisputes, Permission.RecordSupportDecisions],
  },
  {
    id: 'admins',
    label: 'Administrators',
    path: '/admins',
    anyOf: [Permission.ManageAdmins],
  },
  {
    id: 'audit',
    label: 'Audit logs',
    path: '/audit',
    anyOf: [Permission.ManageAdmins],
  },
];

export function navItemsForRole(role: StaffRole): NavItem[] {
  return NAV_ITEMS.filter((item) =>
    item.anyOf.some((permission) => staffRoleHasPermission(role, permission)),
  );
}

export function canAccessPath(role: StaffRole, path: string): boolean {
  const normalized = path.split('?')[0] || path;
  const exact = NAV_ITEMS.find((nav) => nav.path === normalized);
  if (exact) {
    return exact.anyOf.some((permission) => staffRoleHasPermission(role, permission));
  }
  // Nested routes inherit the nearest parent nav item (e.g. /riders/:id → /riders).
  const parent = NAV_ITEMS.filter((nav) => nav.path !== '/').find(
    (nav) => normalized === nav.path || normalized.startsWith(`${nav.path}/`),
  );
  if (!parent) return false;
  return parent.anyOf.some((permission) => staffRoleHasPermission(role, permission));
}
