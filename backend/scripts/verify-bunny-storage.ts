/**
 * Opt-in Bunny Edge Storage + CDN token live verification.
 *
 * Does NOT run during `npm test`. Uploads a tiny JPEG probe object, signs a
 * download URL, GETs it, then best-effort deletes nothing (probe stays under
 * riders/… for ops cleanup if needed).
 *
 * Usage (from backend/, with providers.env / .env loaded):
 *
 *   BUNNY_LIVE_VERIFY=1 npx tsx scripts/verify-bunny-storage.ts
 */

import 'dotenv/config';

import { createObjectStorage } from '../src/infrastructure/storage/object-storage.js';
import { env } from '../src/config/env.js';

/** Tiny JPEG probe (SOI + EOI). Content validity is irrelevant for the API check. */
const TINY_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9,
]);

async function main() {
  if (process.env.BUNNY_LIVE_VERIFY !== '1') {
    console.error(
      'Refusing to run: set BUNNY_LIVE_VERIFY=1 to opt in. This script is not part of the automated suite.',
    );
    process.exit(2);
  }

  if (env.STORAGE_PROVIDER.trim().toLowerCase() !== 'bunny') {
    console.error('STORAGE_PROVIDER must be bunny for this verify script.');
    process.exit(2);
  }

  const storage = createObjectStorage();
  const probeRiderId = '00000000-0000-4000-8000-000000000001';

  console.log('Uploading probe object…');
  const stored = await storage.put({
    riderId: probeRiderId,
    kind: 'VERIFY_PROBE',
    contentType: 'image/jpeg',
    body: TINY_JPEG,
  });
  console.log('Upload OK:', stored.storageKey);

  console.log('Signing download URL…');
  const url = await storage.getSignedDownloadUrl(stored.storageKey, 60);
  console.log('Signed URL minted (expires ~60s)');

  console.log('Fetching signed URL…');
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('Signed download failed', {
      status: response.status,
      body: body.slice(0, 300),
    });
    process.exit(1);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    console.error('Signed download returned empty body');
    process.exit(1);
  }

  console.log('Bunny storage verify OK', {
    storageKey: stored.storageKey,
    downloadBytes: bytes.length,
    contentType: response.headers.get('content-type'),
  });
}

main().catch((error) => {
  console.error('Bunny storage verify failed', error);
  process.exit(1);
});
