import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { Permission, staffRoleHasPermission } from '../config/permissions';

const LINKS: {
  to: string;
  label: string;
  end?: boolean;
  anyOf?: readonly Permission[];
}[] = [
  { to: '/finance', label: 'Overview', end: true },
  { to: '/finance/refunds', label: 'Refunds', anyOf: [Permission.ViewPayments] },
  { to: '/finance/cases', label: 'Cases', anyOf: [Permission.ViewPayments] },
  { to: '/finance/packages', label: 'Packages', anyOf: [Permission.ManageTokenPackages] },
  { to: '/finance/purchases', label: 'Purchases', anyOf: [Permission.ViewPayments] },
  { to: '/finance/ledgers', label: 'Ledgers', anyOf: [Permission.ViewTokenLedgers] },
];

export function FinanceLayout() {
  const auth = useAuth();
  const role = auth.staffRole;
  const links = LINKS.filter(
    (link) =>
      !link.anyOf || (role !== null && link.anyOf.some((p) => staffRoleHasPermission(role, p))),
  );

  return (
    <div className="space-y-4">
      <nav
        aria-label="Finance sections"
        className="flex flex-wrap gap-2 border-b border-[var(--color-border)] pb-3"
        data-testid="finance-subnav"
      >
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm ${
                isActive
                  ? 'bg-[var(--color-accent)] font-medium text-white'
                  : 'border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-slate-50'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
