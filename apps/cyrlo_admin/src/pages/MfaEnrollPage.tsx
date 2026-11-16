import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { Button, ErrorBanner, Label, Muted, PageCard, TextInput } from '../components/ui';

export function MfaEnrollPage() {
  const auth = useAuth();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  if (auth.phase === 'authenticated') return <Navigate to="/" replace />;
  if (auth.phase !== 'mfa_enrollment_required') return <Navigate to="/login" replace />;

  const enrollmentToken = auth.pendingEnrollment?.enrollmentToken;

  useEffect(() => {
    if (!enrollmentToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const started = await auth.startEnrollment();
        if (!cancelled) {
          setQr(started.qrCodeDataUrl);
          auth.clearError();
        }
      } catch {
        if (!cancelled) setQr(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // loadAttempt is an intentional manual-retry trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentToken, loadAttempt]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    try {
      await auth.confirmEnrollment(code.trim());
    } catch {
      // auth.error
    }
  }

  return (
    <PageCard title="Set up MFA">
      <Muted>Scan the QR code with your authenticator app, then enter a code to confirm.</Muted>
      <ErrorBanner
        message={auth.error}
        onRetry={auth.error ? () => setLoadAttempt((n) => n + 1) : undefined}
        retryDisabled={auth.busy}
      />
      {qr ? (
        <img src={qr} alt="MFA enrollment QR" className="mx-auto mb-4 h-48 w-48" />
      ) : (
        <Muted>{auth.busy ? 'Preparing enrollment…' : 'Waiting for enrollment QR…'}</Muted>
      )}
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label>Confirmation code</Label>
          <TextInput
            value={code}
            onChange={(e) => setCode(e.target.value)}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            required
          />
        </div>
        <Button type="submit" disabled={auth.busy || !qr} className="w-full">
          {auth.busy ? 'Confirming…' : 'Enable MFA'}
        </Button>
      </form>
    </PageCard>
  );
}
