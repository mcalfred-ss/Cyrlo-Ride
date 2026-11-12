import { Outlet } from 'react-router-dom';

import { env } from '../config/env';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-center text-xs text-[var(--color-muted)]">
        Cyrlo Admin · {env.environment}
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <Outlet />
      </div>
    </div>
  );
}
