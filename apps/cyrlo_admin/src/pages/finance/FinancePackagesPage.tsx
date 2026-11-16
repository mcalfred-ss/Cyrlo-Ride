import { useRef, useState, type FormEvent } from 'react';

import {
  createTokenPackage,
  fetchTokenPackages,
  updateTokenPackage,
} from '../../api/admin-tokens';
import type { AdminTokenPackage } from '../../api/types';
import { useAuth } from '../../auth/AuthProvider';
import { LoadError } from '../../components/LoadError';
import { tableWrap, theadCls } from '../../components/Pagination';
import { Button, ErrorBanner, Label, Muted, TextInput } from '../../components/ui';
import { Permission, staffRoleHasPermission } from '../../config/permissions';
import { errorMessage, formatDate } from '../../lib/apiMessage';
import { formatGhsFromPesewas } from '../../lib/money';
import { useLoader } from '../../lib/useLoader';

interface FormValues {
  code: string;
  name: string;
  tokenQuantity: string;
  pricePesewas: string;
  displayOrder: string;
  isActive: boolean;
}

const EMPTY_FORM: FormValues = {
  code: '',
  name: '',
  tokenQuantity: '',
  pricePesewas: '',
  displayOrder: '0',
  isActive: true,
};

function toForm(pkg: AdminTokenPackage): FormValues {
  return {
    code: pkg.code,
    name: pkg.name,
    tokenQuantity: String(pkg.tokenQuantity),
    pricePesewas: String(pkg.pricePesewas),
    displayOrder: String(pkg.displayOrder),
    isActive: pkg.isActive,
  };
}

function parseInt0(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  return Number(value.trim());
}

function PackageForm({
  editing,
  onSaved,
  onCancel,
}: {
  editing: AdminTokenPackage | null;
  onSaved: (pkg: AdminTokenPackage, created: boolean) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<FormValues>(editing ? toForm(editing) : EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const quantity = parseInt0(values.tokenQuantity);
  const price = parseInt0(values.pricePesewas);
  const order = parseInt0(values.displayOrder);
  const valid =
    values.name.trim().length > 0 &&
    (editing !== null || values.code.trim().length > 0) &&
    quantity !== null &&
    quantity > 0 &&
    price !== null &&
    price > 0 &&
    order !== null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      if (editing) {
        const saved = await updateTokenPackage(editing.id, {
          name: values.name.trim(),
          tokenQuantity: quantity!,
          pricePesewas: price!,
          displayOrder: order!,
          isActive: values.isActive,
        });
        onSaved(saved, false);
      } else {
        const saved = await createTokenPackage({
          code: values.code.trim(),
          name: values.name.trim(),
          tokenQuantity: quantity!,
          pricePesewas: price!,
          currency: 'GHS',
          displayOrder: order!,
          isActive: values.isActive,
        });
        onSaved(saved, true);
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to save package'));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm"
      data-testid="package-form"
    >
      <h3 className="text-sm font-semibold text-[var(--color-text)]">
        {editing ? `Edit package ${editing.code}` : 'Create token package'}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label>Code</Label>
          <TextInput
            value={values.code}
            disabled={busy || editing !== null}
            onChange={(e) => set('code', e.target.value)}
            data-testid="package-code"
          />
        </div>
        <div>
          <Label>Name</Label>
          <TextInput
            value={values.name}
            disabled={busy}
            onChange={(e) => set('name', e.target.value)}
            data-testid="package-name"
          />
        </div>
        <div>
          <Label>Tokens</Label>
          <TextInput
            inputMode="numeric"
            value={values.tokenQuantity}
            disabled={busy}
            onChange={(e) => set('tokenQuantity', e.target.value)}
            data-testid="package-quantity"
          />
        </div>
        <div>
          <Label>Price (pesewas)</Label>
          <TextInput
            inputMode="numeric"
            value={values.pricePesewas}
            disabled={busy}
            onChange={(e) => set('pricePesewas', e.target.value)}
            data-testid="package-price"
          />
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {price !== null ? formatGhsFromPesewas(price) : 'Integer pesewas (100 = GH₵1.00)'}
          </p>
        </div>
        <div>
          <Label>Display order</Label>
          <TextInput
            inputMode="numeric"
            value={values.displayOrder}
            disabled={busy}
            onChange={(e) => set('displayOrder', e.target.value)}
            data-testid="package-order"
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            checked={values.isActive}
            disabled={busy}
            onChange={(e) => set('isActive', e.target.checked)}
            data-testid="package-active"
          />
          Active (visible to riders)
        </label>
      </div>
      <ErrorBanner message={error} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !valid} data-testid="package-submit">
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create package'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function FinancePackagesPage() {
  const auth = useAuth();
  const role = auth.staffRole;
  const canManage = role !== null && staffRoleHasPermission(role, Permission.ManageTokenPackages);
  const { state, reload } = useLoader(
    () => (canManage ? fetchTokenPackages() : Promise.resolve([] as AdminTokenPackage[])),
    canManage ? 'manage' : 'none',
  );
  const [form, setForm] = useState<{ editing: AdminTokenPackage | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!canManage) {
    return (
      <p className="text-sm text-[var(--color-muted)]" data-testid="packages-denied">
        Token packages require the ManageTokenPackages permission.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="mb-1 text-2xl font-semibold text-[var(--color-text)]">Token packages</h2>
          <Muted>
            Packages riders can buy. Changes require a recent MFA verification and take effect for
            new purchases only.
          </Muted>
        </div>
        <Button
          type="button"
          disabled={form !== null}
          onClick={() => {
            setForm({ editing: null });
            setNotice(null);
          }}
          data-testid="packages-create-open"
        >
          New package
        </Button>
      </div>

      {notice ? (
        <p
          className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"
          data-testid="packages-notice"
        >
          {notice}
        </p>
      ) : null}

      {form ? (
        <PackageForm
          key={form.editing?.id ?? 'new'}
          editing={form.editing}
          onCancel={() => setForm(null)}
          onSaved={(pkg, created) => {
            setForm(null);
            setNotice(`Package ${pkg.code} ${created ? 'created' : 'updated'}.`);
            reload();
          }}
        />
      ) : null}

      {state.status === 'loading' ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="packages-loading">
          Loading packages…
        </p>
      ) : null}
      {state.status === 'error' ? (
        <LoadError
          testId="packages-error"
          message={state.message}
          httpStatus={state.httpStatus}
          onRetry={reload}
        />
      ) : null}
      {state.status === 'ready' && state.data.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]" data-testid="packages-empty">
          No token packages yet.
        </p>
      ) : null}
      {state.status === 'ready' && state.data.length > 0 ? (
        <div className={tableWrap}>
          <table className="min-w-full text-left text-sm" data-testid="packages-table">
            <thead className={theadCls}>
              <tr>
                <th className="px-3 py-2 font-medium">Code</th>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Tokens</th>
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Active</th>
                <th className="px-3 py-2 font-medium">Order</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {state.data.map((pkg) => (
                <tr
                  key={pkg.id}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                  data-testid={`packages-row-${pkg.id}`}
                >
                  <td className="px-3 py-2 font-mono text-xs">{pkg.code}</td>
                  <td className="px-3 py-2">{pkg.name}</td>
                  <td className="px-3 py-2 tabular-nums">{pkg.tokenQuantity}</td>
                  <td className="px-3 py-2 tabular-nums">{formatGhsFromPesewas(pkg.pricePesewas)}</td>
                  <td className="px-3 py-2">{pkg.isActive ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2 tabular-nums">{pkg.displayOrder}</td>
                  <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatDate(pkg.updatedAt)}
                  </td>
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        setForm({ editing: pkg });
                        setNotice(null);
                      }}
                      data-testid={`packages-edit-${pkg.id}`}
                    >
                      Edit
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
