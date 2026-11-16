import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { canAccessPath } from '../config/nav';
import { getAccessToken } from './session-store';
import { hasPrivilegedMfaAssurance } from './token-claims';
import { useAuth } from './AuthProvider';

/** Blocks dashboard routes unless in-memory MFA access token + /admin/me succeeded. */
export function RequireMfaSession() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.phase === 'session_expired') {
    return <Navigate to="/session-expired" replace />;
  }

  if (auth.phase !== 'authenticated' || !auth.me || !auth.staffRole) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!hasPrivilegedMfaAssurance(getAccessToken())) {
    return <Navigate to="/session-expired" replace />;
  }

  if (!canAccessPath(auth.staffRole, location.pathname)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <Outlet />;
}
