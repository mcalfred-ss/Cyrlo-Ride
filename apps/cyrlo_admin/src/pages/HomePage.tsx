import { useAuth } from '../auth/AuthProvider';
import { staffRoleLabel } from '../config/permissions';
import { Muted } from '../components/ui';

export function HomePage() {
  const auth = useAuth();
  const role = auth.staffRole;

  return (
    <div>
      <h2 className="mb-2 text-2xl font-semibold">Welcome</h2>
      <Muted>
        Signed in as {auth.me?.displayName ?? auth.me?.phoneNumber}
        {role ? ` · ${staffRoleLabel(role)}` : null}
      </Muted>
      {auth.recoveryCodes ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="mb-2 font-medium">Save these recovery codes now (shown once):</p>
          <ul className="list-disc pl-5 font-mono">
            {auth.recoveryCodes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-6 text-sm text-[var(--color-muted)]">
        Use the sidebar to open module placeholders. Privileged access requires a live MFA
        access token; expiry forces OTP + MFA again.
      </p>
    </div>
  );
}
