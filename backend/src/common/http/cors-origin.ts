/**
 * True for machine-local browser origins used by Flutter Web / Vite / etc.
 * Ports change every `flutter run -d chrome`, so exact CORS_ORIGINS entries are brittle.
 */
export function isLocalBrowserOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '[::1]' ||
      url.hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowedOrigins: ReadonlySet<string> | readonly string[],
  options: { allowLocalBrowser?: boolean } = {},
): boolean {
  if (!origin) return true; // non-browser / mobile clients
  const allowed =
    allowedOrigins instanceof Set
      ? allowedOrigins
      : new Set(allowedOrigins);
  if (allowed.has(origin)) return true;
  if (options.allowLocalBrowser !== false && isLocalBrowserOrigin(origin)) {
    return true;
  }
  return false;
}
