/**
 * Opt-in FCM HTTP v1 live verification.
 *
 * Does NOT run during `npm test`. Requires explicit env flags and a dedicated
 * test device token. Reports FCM provider acceptance only — not confirmed
 * device receipt.
 *
 * Usage (from backend/):
 *
 *   FCM_LIVE_VERIFY=1 ^
 *   FCM_LIVE_DEVICE_TOKEN=<registration-token> ^
 *   FCM_LIVE_PLATFORM=ANDROID ^
 *   npx tsx scripts/verify-fcm-http-v1.ts
 *
 * Requires FCM_PROJECT_ID + FCM_SERVICE_ACCOUNT_FILE in the environment (.env).
 */

import { loadEnv } from '../src/config/env.js';
import { createPushProvider } from '../src/infrastructure/push/push.provider.js';

async function main() {
  if (process.env.FCM_LIVE_VERIFY !== '1') {
    console.error(
      'Refusing to run: set FCM_LIVE_VERIFY=1 to opt in. This script is not part of the automated suite.',
    );
    process.exit(2);
  }

  const deviceToken = (process.env.FCM_LIVE_DEVICE_TOKEN ?? '').trim();
  if (!deviceToken) {
    console.error('FCM_LIVE_DEVICE_TOKEN is required (dedicated test device only).');
    process.exit(2);
  }

  const platformRaw = (process.env.FCM_LIVE_PLATFORM ?? 'ANDROID').trim().toUpperCase();
  if (platformRaw !== 'ANDROID' && platformRaw !== 'IOS') {
    console.error('FCM_LIVE_PLATFORM must be ANDROID or IOS');
    process.exit(2);
  }
  const platform = platformRaw as 'ANDROID' | 'IOS';

  const env = loadEnv();
  console.log(
    JSON.stringify({
      phase: '11C',
      mode: 'live-verify',
      firebaseProjectId: env.FCM_PROJECT_ID || null,
      platform,
      tokenPreview: `${deviceToken.slice(0, 6)}…${deviceToken.slice(-4)}`,
      note: 'Provider acceptance ≠ device receipt',
    }),
  );

  const push = createPushProvider({
    provider: env.PUSH_PROVIDER || 'fcm',
    projectId: env.FCM_PROJECT_ID,
    serviceAccountFile: env.FCM_SERVICE_ACCOUNT_FILE,
    apiKey: env.PUSH_API_KEY,
    nodeEnv: env.NODE_ENV,
  });

  const result = await push.sendToToken({
    token: deviceToken,
    platform,
    message: {
      title: 'Cyrlo Ride FCM verify',
      body: 'HTTP v1 live verification (operator-invoked)',
      data: {
        eventType: 'ops.fcm_live_verify',
        category: 'GENERAL',
      },
    },
  });

  console.log(
    JSON.stringify({
      providerAcceptance: result.outcome === 'sent',
      outcome: result.outcome,
      code: 'code' in result ? result.code : null,
      message: 'message' in result ? result.message : null,
      deviceReceiptConfirmed: false,
    }),
  );

  process.exit(result.outcome === 'sent' ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : 'unknown_error',
    }),
  );
  process.exit(1);
});
