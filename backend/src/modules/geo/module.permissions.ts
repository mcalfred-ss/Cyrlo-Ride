import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import type { StaffRole } from '../../common/types/staff-roles.js';

/** Create/edit countries, regions, districts, and run imports. */
export const GEO_HIERARCHY_WRITE_PERMISSIONS = [Permission.ManageGeoHierarchy] as const;

/** Create/edit communities. */
export const GEO_COMMUNITY_WRITE_PERMISSIONS = [
  Permission.ManageServiceZones,
  Permission.ManageGeoHierarchy,
] as const;

/** Read-only coverage / hierarchy browsing. */
export const GEO_READ_PERMISSIONS = [
  Permission.ViewGeoCoverage,
  Permission.ManageServiceZones,
  Permission.ManageGeoHierarchy,
] as const;

/** Bulk import (preview + confirm). */
export const GEO_IMPORT_PERMISSIONS = [Permission.ManageGeoHierarchy] as const;

function hasAny(role: StaffRole, permissions: readonly Permission[]): boolean {
  return permissions.some((permission) => staffRoleHasPermission(role, permission));
}

export const geoAccess = {
  canRead: (role: StaffRole) => hasAny(role, GEO_READ_PERMISSIONS),
  canWriteHierarchy: (role: StaffRole) => hasAny(role, GEO_HIERARCHY_WRITE_PERMISSIONS),
  canWriteCommunities: (role: StaffRole) => hasAny(role, GEO_COMMUNITY_WRITE_PERMISSIONS),
  canImport: (role: StaffRole) => hasAny(role, GEO_IMPORT_PERMISSIONS),
};
