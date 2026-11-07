import { AppError } from '../common/errors/app-error.js';

/**
 * Parsed TRUST_PROXY configuration.
 *
 * - `false`: do not trust X-Forwarded-* (local / direct exposure).
 * - `number`: trust that many proxy hops (e.g. 1 = single reverse proxy).
 * - `string[]`: explicit trusted proxy IPs / CIDRs (Express subnet list).
 *
 * Never maps the bare string `"true"` to Express `trust proxy = true`
 * (that would trust arbitrary client-supplied X-Forwarded-For).
 */
export type TrustProxySetting = false | number | string[];

export function parseTrustProxyEnv(raw: string | undefined): TrustProxySetting {
  const value = (raw ?? 'false').trim();
  if (value.length === 0 || value.toLowerCase() === 'false' || value === '0') {
    return false;
  }
  if (value.toLowerCase() === 'true') {
    throw new AppError({
      status: 500,
      code: 'INTERNAL_ERROR',
      message:
        'TRUST_PROXY=true is not allowed. Use a hop count (e.g. 1) or a comma-separated list of trusted proxy IPs/CIDRs.',
    });
  }
  if (/^\d+$/.test(value)) {
    const hops = Number.parseInt(value, 10);
    if (!Number.isInteger(hops) || hops < 1 || hops > 5) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'TRUST_PROXY hop count must be an integer from 1 to 5',
      });
    }
    return hops;
  }

  const entries = value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (entries.length === 0) {
    return false;
  }
  for (const entry of entries) {
    if (!isPlausibleProxyEntry(entry)) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: `TRUST_PROXY entry is invalid: ${entry}`,
      });
    }
  }
  return entries;
}

function isPlausibleProxyEntry(entry: string): boolean {
  const lowered = entry.toLowerCase();
  if (lowered === 'loopback' || lowered === 'linklocal' || lowered === 'uniquelocal') {
    return true;
  }
  // IPv4 or IPv4/CIDR
  if (/^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(entry)) {
    return true;
  }
  // Compact IPv6 / CIDR — reject URLs and hostnames (no scheme, no letters outside hex)
  if (
    entry.includes(':') &&
    !entry.includes('://') &&
    entry.length >= 2 &&
    entry.length <= 64 &&
    /^[0-9a-fA-F:.\/]+$/.test(entry)
  ) {
    return true;
  }
  return false;
}

/** Express `app.set('trust proxy', …)` value. */
export function toExpressTrustProxy(setting: TrustProxySetting): false | number | string[] {
  return setting;
}
