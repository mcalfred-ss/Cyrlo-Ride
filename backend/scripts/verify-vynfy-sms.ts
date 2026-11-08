/**
 * Opt-in Vynfy SMS live verification.
 *
 * Does NOT run during `npm test`. Requires explicit flags and a dedicated
 * destination number. Reports Vynfy API acceptance only — not confirmed
 * handset delivery. Consumes real SMS credits.
 *
 * Usage (from backend/):
 *
 *   VYNFY_LIVE_VERIFY=1 ^
 *   VYNFY_LIVE_TO=+233XXXXXXXXX ^
 *   npx tsx scripts/verify-vynfy-sms.ts
 *
 * Requires VYNFY_API_KEY + VYNFY_SENDER_ID in the environment (.env).
 * Never prints credentials. Never uses production customer records.
 */

import { loadEnv } from '../src/config/env.js';
import { maskPhone } from '../src/infrastructure/sms/sms.provider.js';
import { VynfySmsProvider } from '../src/infrastructure/sms/vynfy-sms.provider.js';

async function main() {
  if (process.env.VYNFY_LIVE_VERIFY !== '1') {
    console.error(
      'Refusing to run: set VYNFY_LIVE_VERIFY=1 to opt in. This script is not part of the automated suite.',
    );
    process.exit(2);
  }

  const to = (process.env.VYNFY_LIVE_TO ?? '').trim();
  if (!to) {
    console.error('VYNFY_LIVE_TO is required (dedicated test handset in +233XXXXXXXXX form).');
    process.exit(2);
  }

  // Force SMS_PROVIDER=vynfy for this opt-in script so loadEnv validates credentials.
  process.env.SMS_PROVIDER = 'vynfy';
  const env = loadEnv();

  if (!env.VYNFY_API_KEY.trim() || !env.VYNFY_SENDER_ID.trim()) {
    console.error('VYNFY_API_KEY and VYNFY_SENDER_ID must be configured (never commit them).');
    process.exit(2);
  }

  console.log(
    JSON.stringify({
      phase: '13B',
      mode: 'live-verify',
      adapter: 'vynfy',
      endpoint: 'https://sms.vynfy.com/api/v1/send',
      senderId: env.VYNFY_SENDER_ID,
      to: maskPhone(to),
      warning: 'This send consumes real Vynfy SMS credits',
      note: 'API acceptance ≠ confirmed handset delivery',
    }),
  );

  const sms = new VynfySmsProvider({
    apiKey: env.VYNFY_API_KEY,
    senderId: env.VYNFY_SENDER_ID,
  });

  const stamp = new Date().toISOString();
  await sms.send({
    to,
    body: `Cyrlo Ride Vynfy live verify ${stamp}. Ignore if unexpected.`,
  });

  console.log(
    JSON.stringify({
      providerAcceptance: true,
      deliveryConfirmed: false,
      senderId: env.VYNFY_SENDER_ID,
      to: maskPhone(to),
      message: 'Vynfy API accepted the request. Confirm handset receipt manually on MTN/Telecel/AT as needed.',
    }),
  );
  process.exit(0);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown_error';
  console.error(
    JSON.stringify({
      ok: false,
      providerAcceptance: false,
      deliveryConfirmed: false,
      error: message,
    }),
  );
  process.exit(1);
});
