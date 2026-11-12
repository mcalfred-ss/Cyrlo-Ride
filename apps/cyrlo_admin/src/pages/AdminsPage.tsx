import { useRef, useState, type FormEvent } from 'react';

import { createAdminInvitation, revokeAdminGrant } from '../api/admin-staff';
import type { CreateAdminInvitationInput, CreateAdminInvitationResult } from '../api/types';
import { Button, ErrorBanner, Label, Muted, Panel, TextInput } from '../components/ui';
import { selectCls } from '../components/Pagination';
import { staffRoleLabel } from '../config/permissions';
import { ConfirmReasonPanel } from '../features/applications/ConfirmReasonPanel';
import { UUID_RE, errorMessage, formatDate } from '../lib/apiMessage';

const ROLES: CreateAdminInvitationInput['staffRole'][] = [
  'OPERATIONS_ADMIN',
  'FINANCE_ADMIN',
  'SUPPORT_ADMIN',
  'SUPER_ADMIN',
];

function InviteForm({ onCreated }: { onCreated: (result: CreateAdminInvitationResult) => void }) {
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<CreateAdminInvitationInput['staffRole']>('OPERATIONS_ADMIN');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const valid = phone.trim().length >= 8;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await createAdminInvitation({ phoneNumber: phone.trim(), staffRole: role });
      setPhone('');
      onCreated(result);
    } catch (err) {
      setError(errorMessage(err, 'Failed to create invitation'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Invite administrator"
      description="Creates a single-use invitation for the phone number. Share the token out of band."
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3" data-testid="invite-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Phone number (E.164)</Label>
            <TextInput
              value={phone}
              disabled={busy}
              placeholder="+233201234567"
              onChange={(e) => setPhone(e.target.value)}
              data-testid="invite-phone"
            />
          </div>
          <div>
            <Label>Staff role</Label>
            <select
              className={selectCls}
              value={role}
              disabled={busy}
              onChange={(e) => setRole(e.target.value as CreateAdminInvitationInput['staffRole'])}
              data-testid="invite-role"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {staffRoleLabel(r)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <ErrorBanner message={error} />
        <Button type="submit" disabled={busy || !valid} data-testid="invite-submit">
          {busy ? 'Creating…' : 'Create invitation'}
        </Button>
      </form>
    </Panel>
  );
}

function RevokeForm() {
  const [userId, setUserId] = useState('');
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inFlight = useRef(false);
  const trimmedId = userId.trim();
  const validId = UUID_RE.test(trimmedId);

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await revokeAdminGrant({ userId: trimmedId, reason: reason.trim() });
      setNotice(`Admin access revoked for ${trimmedId}.`);
      setOpen(false);
      setReason('');
      setUserId('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to revoke admin access'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Panel
      title="Revoke administrator"
      description="Removes admin access for a user by ID. This console has no admin directory — copy the user ID from your records or the audit log."
    >
      <div className="space-y-3" data-testid="revoke-form">
        <div className="max-w-xl">
          <Label>User ID</Label>
          <TextInput
            value={userId}
            disabled={busy}
            placeholder="UUID"
            onChange={(e) => {
              setUserId(e.target.value);
              setNotice(null);
            }}
            data-testid="revoke-user-id"
          />
        </div>
        {notice ? (
          <p
            className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
            data-testid="revoke-notice"
          >
            {notice}
          </p>
        ) : null}
        {!open ? (
          <Button
            type="button"
            variant="danger"
            disabled={!validId}
            onClick={() => {
              setOpen(true);
              setError(null);
              setNotice(null);
            }}
            data-testid="revoke-open"
          >
            Revoke access…
          </Button>
        ) : (
          <ConfirmReasonPanel
            testId="revoke-panel"
            title={`Revoke admin access for ${trimmedId}`}
            description="The user loses all staff permissions. Sessions may remain valid until they expire."
            confirmLabel="Revoke access"
            reasonRequired
            reasonMinLength={5}
            reason={reason}
            onReasonChange={setReason}
            busy={busy}
            error={error}
            danger
            onCancel={() => setOpen(false)}
            onConfirm={() => void submit()}
          />
        )}
      </div>
    </Panel>
  );
}

export function AdminsPage() {
  const [invitation, setInvitation] = useState<CreateAdminInvitationResult | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Administrators</h2>
        <Muted>
          Invite staff and revoke admin access. There is no admin directory API, so existing
          administrators are not listed here. Changes require a recent MFA verification.
        </Muted>
      </div>

      {invitation ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
          data-testid="invite-token-banner"
        >
          <p className="font-semibold">Invitation created — copy the token now.</p>
          <p className="mt-1 text-xs">
            This token is shown once and cannot be retrieved again. Expires{' '}
            {formatDate(invitation.expiresAt)} · Invitation {invitation.invitationId}
          </p>
          <code
            className="mt-2 block break-all rounded bg-white px-2 py-1 font-mono text-xs"
            data-testid="invite-token-value"
          >
            {invitation.token}
          </code>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => setInvitation(null)}
            data-testid="invite-token-dismiss"
          >
            I have copied it — dismiss
          </Button>
        </div>
      ) : null}

      <InviteForm onCreated={setInvitation} />
      <RevokeForm />
    </div>
  );
}
