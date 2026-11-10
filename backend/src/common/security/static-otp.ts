/**
 * Allowlisted phone → fixed OTP for store review and internal QA.
 * Format: "+233555010001:246810,+233555010002:246810"
 * Only exact E.164 matches are accepted. Empty / invalid pairs are ignored.
 */
export function parseStaticOtpLogins(raw: string | undefined | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw || !raw.trim()) return map;

  for (const part of raw.split(',')) {
    const entry = part.trim();
    if (!entry) continue;
    const colon = entry.lastIndexOf(':');
    if (colon <= 0) continue;
    const phone = entry.slice(0, colon).trim();
    const code = entry.slice(colon + 1).trim();
    if (!/^\+233\d{9}$/.test(phone)) continue;
    if (!/^\d{6}$/.test(code)) continue;
    map.set(phone, code);
  }
  return map;
}

export function staticOtpForPhone(
  phoneNumber: string,
  rawAllowlist: string | undefined | null,
): string | null {
  return parseStaticOtpLogins(rawAllowlist).get(phoneNumber) ?? null;
}
