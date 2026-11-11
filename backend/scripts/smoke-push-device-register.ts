/**
 * Smoke: OTP login as passenger + rider review accounts, register a device token each.
 *
 *   npx tsx scripts/smoke-push-device-register.ts
 *
 * Uses staging API by default.
 */
const API_BASE =
  process.env.API_BASE_URL?.replace(/\/$/, '') ??
  'https://cyrloride.eqostack.com/api/v1';

const ACCOUNTS = [
  { role: 'PASSENGER', phone: '+233555010011', label: 'passenger' },
  { role: 'RIDER', phone: '+233555010012', label: 'rider' },
] as const;

const OTP = '246810';

async function jsonFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || body.success === false) {
    throw new Error(`${path} → HTTP ${res.status} ${JSON.stringify(body)}`);
  }
  return body;
}

async function login(phone: string, role: string) {
  await jsonFetch('/auth/otp', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: phone }),
  });
  const verified = await jsonFetch('/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber: phone, code: OTP, role }),
  });
  const data = verified.data as { accessToken?: string };
  if (!data?.accessToken) throw new Error('No accessToken in verify response');
  return data.accessToken;
}

async function registerDevice(accessToken: string, label: string) {
  const token = `smoke-${label}-${Date.now()}-abcdefghijklmnop`;
  const registered = await jsonFetch('/notifications/devices', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      token,
      platform: 'ANDROID',
      provider: 'FCM',
    }),
  });
  const data = registered.data as { id?: string; tokenPreview?: string };
  console.log(`${label}: device id=${data.id} preview=${data.tokenPreview}`);
  return data.id!;
}

async function main() {
  console.log(`API ${API_BASE}`);
  for (const account of ACCOUNTS) {
    const accessToken = await login(account.phone, account.role);
    await registerDevice(accessToken, account.label);
  }
  console.log('OK — passenger + rider device registration smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
