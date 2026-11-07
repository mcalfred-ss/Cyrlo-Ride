export const StaffRole = {
  SuperAdmin: 'SUPER_ADMIN',
  OperationsAdmin: 'OPERATIONS_ADMIN',
  FinanceAdmin: 'FINANCE_ADMIN',
  SupportAdmin: 'SUPPORT_ADMIN',
} as const;

export type StaffRole = (typeof StaffRole)[keyof typeof StaffRole];

const staffRoles = new Set<string>(Object.values(StaffRole));

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === 'string' && staffRoles.has(value);
}
