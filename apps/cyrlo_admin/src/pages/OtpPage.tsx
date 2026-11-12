import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorBanner, Label, Muted, PageCard, TextInput } from '../components/ui';

export function OtpPage() {
  const auth = useAuth();
  const [code, setCode] = useState('');

  if (auth.phase === 'authenticated') return <Navigate to="/" replace />;
  if (auth.phase === 'anonymous') return <Navigate to="/login" replace />;
  if (auth.phase === 'mfa_required') return <Navigate to="/mfa" replace />;
  if (auth.phase === 'mfa_enrollment_required') return <Navigate to="/mfa/enroll" replace />;
  if (auth.phase === 'session_expired') return <Navigate to="/session-expired" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await auth.verifyOtp(code.trim());
    } catch {
      // auth.error
    }
  }

  async function resendOtp() {
    try {
      await auth.requestOtp(auth.phoneNumber);
    } catch {
      // auth.error
    }
  }

  return (
    <PageCard title="Enter OTP">
      <Muted>
        Code sent to <span className="font-medium text-[var(--color-text)]">{auth.phoneNumber}</span>
      </Muted>
      {auth.developmentCode ? (
        <Muted>Dev code: {auth.developmentCode}</Muted>
      ) : null}
      <ErrorBanner
        message={auth.error}
        onRetry={auth.error ? () => void resendOtp() : undefined}
        retryLabel="Resend OTP"
        retryDisabled={auth.busy}
      />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label>6-digit code</Label>
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
          />
        </div>
        <Button type="submit" disabled={auth.busy} className="w-full">
          {auth.busy ? 'Verifying…' : 'Continue'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={auth.busy}
          className="w-full"
          onClick={() => void resendOtp()}
        >
          Resend OTP
        </Button>
      </form>
    </PageCard>
  );
}
