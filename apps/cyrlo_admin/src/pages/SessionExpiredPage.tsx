import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { Button, Muted, PageCard } from '../components/ui';

export function SessionExpiredPage() {
  const auth = useAuth();

  if (auth.phase === 'authenticated') return <Navigate to="/" replace />;
  if (auth.phase !== 'session_expired') return <Navigate to="/login" replace />;

  return (
    <PageCard title="Session expired">
      <Muted>
        Your privileged admin access token expired. Cyrlo Admin does not restore MFA via
        /auth/refresh. Sign in again with OTP and MFA.
      </Muted>
      <Button
        className="w-full"
        onClick={() => {
          auth.acknowledgeSessionExpired();
        }}
      >
        Return to login
      </Button>
    </PageCard>
  );
}
