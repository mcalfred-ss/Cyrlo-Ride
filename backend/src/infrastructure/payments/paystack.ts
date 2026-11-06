import { createHmac, timingSafeEqual } from 'node:crypto';

/** Paystack signs the raw request body with HMAC SHA-512. */
export function verifyPaystackSignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature || secret.length === 0) return false;
  const digest = createHmac('sha512', secret).update(rawBody).digest('hex');
  const expected = Buffer.from(digest);
  const received = Buffer.from(signature);
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
