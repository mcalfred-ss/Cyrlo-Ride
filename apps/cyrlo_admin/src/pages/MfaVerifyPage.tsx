import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorBanner, Label, Muted, PageCard, TextInput } from '../components/ui';

export function MfaVerifyPage() {
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  if (auth.phase === 'authenticated') return <Navigate to="/" replace />;
  if (auth.phase !== 'mfa_required') return <Navigate to="/login" replace />;

  async function submitMfa() {
    try {
      if (useRecovery) {
        await auth.verifyMfa({ recoveryCode: recoveryCode.trim() });
      } else {
        await auth.verifyMfa({ code: code.trim() });
      }
    } catch {
      // auth.error
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await submitMfa();
  }

  return (
    <PageCard title="Multi-factor authentication">
      <Muted>Enter your authenticator code to open the admin console.</Muted>
      <ErrorBanner
        message={auth.error}
        onRetry={auth.error ? () => void submitMfa() : undefined}
        retryDisabled={auth.busy}
      />
      <form onSubmit={onSubmit} className="space-y-3">
        {useRecovery ? (
          <div>
            <Label>Recovery code</Label>
            <TextInput
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              required
            />
          </div>
        ) : (
          <div>
            <Label>Authenticator code</Label>
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
            />
          </div>
        )}
        <Button type="submit" disabled={auth.busy} className="w-full">
          {auth.busy ? 'Verifying…' : auth.error ? 'Retry MFA' : 'Verify MFA'}
        </Button>
        <button
          type="button"
          className="text-sm text-[var(--color-accent)] underline"
          onClick={() => setUseRecovery((v) => !v)}
        >
          {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
        </button>
      </form>
    </PageCard>
  );
}
