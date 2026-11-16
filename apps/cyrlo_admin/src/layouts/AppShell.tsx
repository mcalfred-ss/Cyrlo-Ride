import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { env } from '../config/env';
import { navItemsForRole } from '../config/nav';
import { staffRoleLabel } from '../config/permissions';
import { Button } from '../components/ui';

export function AppShell() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const role = auth.staffRole;
  const items = role ? navItemsForRole(role) : [];

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 transform bg-[var(--color-sidebar)] text-[var(--color-sidebar-text)] transition-transform md:static md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="border-b border-white/10 px-4 py-4 text-lg font-semibold tracking-wide">
          Cyrlo Admin
        </div>
        <nav className="flex flex-col gap-1 p-3">
          {items.map((item) => (
            <NavLink
              key={item.id}
              to={item.path}
              end={item.path === '/'}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-medium' : 'hover:bg-white/10'}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded border border-[var(--color-border)] px-2 py-1 text-sm md:hidden"
              onClick={() => setOpen(true)}
            >
              Menu
            </button>
            <span className="text-xs text-[var(--color-muted)]">{env.environment}</span>
          </div>
          <div className="relative">
            <button
              type="button"
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm"
              onClick={() => setMenuOpen((v) => !v)}
            >
              {auth.me?.displayName ?? auth.me?.phoneNumber}
              {role ? ` · ${staffRoleLabel(role)}` : ''}
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-48 rounded-lg border border-[var(--color-border)] bg-white p-2 shadow-md">
                <p className="px-2 py-1 text-xs text-[var(--color-muted)]">{auth.me?.phoneNumber}</p>
                <Button
                  variant="secondary"
                  className="mt-1 w-full"
                  onClick={() => {
                    setMenuOpen(false);
                    void auth.logout();
                  }}
                >
                  Log out
                </Button>
              </div>
            ) : null}
          </div>
        </header>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
