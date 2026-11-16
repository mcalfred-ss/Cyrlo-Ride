import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorBanner, Label, Muted, PageCard, TextInput } from '../components/ui';

/** Normalize Ghana local 0XXXXXXXXX to E.164 +233… when possible. */
function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (/^0\d{9}$/.test(trimmed)) return `+233${trimmed.slice(1)}`;
  return trimmed;
}

export function LoginPage() {
  const auth = useAuth();
  const [phone, setPhone] = useState('');

  if (auth.phase === 'authenticated') return <Navigate to="/" replace />;
  if (auth.phase === 'awaiting_otp') return <Navigate to="/otp" replace />;
  if (auth.phase === 'mfa_required') return <Navigate to="/mfa" replace />;
  if (auth.phase === 'mfa_enrollment_required') return <Navigate to="/mfa/enroll" replace />;
  if (auth.phase === 'session_expired') return <Navigate to="/session-expired" replace />;

  async function sendOtp() {
    const normalized = normalizePhone(phone);
    if (!normalized) return;
    try {
      await auth.requestOtp(normalized);
    } catch {
      // Error text lives on auth.error; Retry uses the same path.
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await sendOtp();
  }

  return (
    <PageCard title="Cyrlo Admin">
      <Muted>Sign in with your staff phone number. MFA is required after OTP.</Muted>
      <ErrorBanner
        message={auth.error}
        onRetry={auth.error ? () => void sendOtp() : undefined}
        retryDisabled={auth.busy || !phone.trim()}
      />
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label>Phone number</Label>
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+233…"
            autoComplete="tel"
            required
          />
        </div>
        <Button type="submit" disabled={auth.busy || !phone.trim()} className="w-full">
          {auth.busy ? 'Sending…' : auth.error ? 'Retry send OTP' : 'Send OTP'}
        </Button>
      </form>
    </PageCard>
  );
}
