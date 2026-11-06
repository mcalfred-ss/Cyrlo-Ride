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
