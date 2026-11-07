/**
 * Mobile auth issues PASSENGER or RIDER only.
 * `ADMIN` remains for schema compatibility. Target staff grants are
 * SUPER_ADMIN, OPERATIONS_ADMIN, FINANCE_ADMIN, SUPPORT_ADMIN (separate RBAC milestone).
 */
export const UserRole = {
  Passenger: 'PASSENGER',
  Rider: 'RIDER',
  Admin: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

const roles = new Set<string>(Object.values(UserRole));

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && roles.has(value);
}
