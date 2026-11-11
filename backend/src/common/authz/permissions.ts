import type { StaffRole } from '../types/staff-roles.js';

/**
 * Central permission catalog. Controllers should call requirePermission(...)
 * instead of comparing staff roles inline.
 */
export const Permission = {
  ViewAdminProfile: 'admin.view_own_profile',
  ManageAdmins: 'admin.manage_admins',
  ManagePlatformConfig: 'admin.manage_platform_config',
  ReviewRiders: 'admin.review_riders',
  ManageRiderDocuments: 'admin.manage_rider_documents',
  SuspendReinstateRiders: 'admin.suspend_reinstate_riders',
  ManageServiceZones: 'admin.manage_service_zones',
  /** Super Admin: create/edit countries, regions, districts. */
  ManageGeoHierarchy: 'admin.manage_geo_hierarchy',
  /** Super Admin: mark zone boundaries verified. */
  VerifyServiceZones: 'admin.verify_service_zones',
  /** Read-only coverage browser for Finance/Support (and Ops/Super). */
  ViewGeoCoverage: 'admin.view_geo_coverage',
  MonitorOperations: 'admin.monitor_operations',
  ViewPayments: 'admin.view_payments',
  ReconcilePaystack: 'admin.reconcile_paystack',
  ManageTokenPackages: 'admin.manage_token_packages',
  ViewTokenLedgers: 'admin.view_token_ledgers',
  ExecuteRefunds: 'admin.execute_refunds',
  ViewFinancialReports: 'admin.view_financial_reports',
  InvestigateDisputes: 'admin.investigate_disputes',
  ViewBookingHistory: 'admin.view_booking_history',
  ViewTripGpsEvidence: 'admin.view_trip_gps_evidence',
  RecommendRefunds: 'admin.recommend_refunds',
  RecordSupportDecisions: 'admin.record_support_decisions',
  AccessIdentityDocuments: 'admin.access_identity_documents',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

const allPermissions = Object.values(Permission);

const rolePermissionMap: Record<StaffRole, readonly Permission[]> = {
  SUPER_ADMIN: allPermissions,
  OPERATIONS_ADMIN: [
    Permission.ViewAdminProfile,
    Permission.ReviewRiders,
    Permission.ManageRiderDocuments,
    Permission.SuspendReinstateRiders,
    Permission.ManageServiceZones,
    Permission.ViewGeoCoverage,
    Permission.MonitorOperations,
    Permission.AccessIdentityDocuments,
    Permission.ViewBookingHistory,
  ],
  FINANCE_ADMIN: [
    Permission.ViewAdminProfile,
    Permission.ViewPayments,
    Permission.ReconcilePaystack,
    Permission.ManageTokenPackages,
    Permission.ViewTokenLedgers,
    Permission.ExecuteRefunds,
    Permission.ViewFinancialReports,
    Permission.ViewGeoCoverage,
  ],
  SUPPORT_ADMIN: [
    Permission.ViewAdminProfile,
    Permission.InvestigateDisputes,
    Permission.ViewBookingHistory,
    Permission.ViewTripGpsEvidence,
    Permission.RecommendRefunds,
    Permission.RecordSupportDecisions,
    Permission.ViewPayments,
    Permission.ViewGeoCoverage,
  ],
};

export function permissionsForStaffRole(role: StaffRole): readonly Permission[] {
  return rolePermissionMap[role];
}

export function staffRoleHasPermission(role: StaffRole, permission: Permission): boolean {
  return rolePermissionMap[role].includes(permission);
}

export function assertStaffRoleHasPermission(role: StaffRole, permission: Permission): void {
  if (!staffRoleHasPermission(role, permission)) {
    const error = new Error('FORBIDDEN');
    (error as Error & { code: string }).code = 'FORBIDDEN';
    throw error;
  }
}
