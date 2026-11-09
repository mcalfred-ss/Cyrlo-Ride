import { createHmac } from 'node:crypto';

/**
 * Bunny CDN Advanced Token Authentication (HMAC-SHA256).
 * Contract: https://bunny.net/docs/cdn/security/token-authentication/advanced
 * Algorithm aligned with BunnyWay/BunnyCDN.TokenAuthentication nodejs/token.js
 * (file URL / query-string form only — no IP lock, no directory tokens).
 */
export function signBunnyCdnFileUrl(input: {
  cdnBaseUrl: string;
  storageKey: string;
  securityKey: string;
  expiresAtUnixSeconds: number;
}): string {
  const base = input.cdnBaseUrl.replace(/\/+$/, '');
  const path = input.storageKey.startsWith('/')
    ? input.storageKey
    : `/${input.storageKey}`;
  const expires = String(input.expiresAtUnixSeconds);

  const hmac = createHmac('sha256', input.securityKey);
  hmac.update(path);
  hmac.update(expires);
  // No IP lock → empty IP bytes; no extra query params → empty signingData.
  hmac.update(Buffer.alloc(0));
  hmac.update('');
  const digest = hmac
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const token = `HS256-${digest}`;
  return `${base}${path}?token=${token}&expires=${expires}`;
}
