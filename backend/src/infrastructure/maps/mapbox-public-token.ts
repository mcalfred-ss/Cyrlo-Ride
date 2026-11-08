/**
 * Public Mapbox tokens (`pk.`) may be sent to Flutter for raster tiles.
 * Secret tokens (`sk.`) and empty values must never leave the server.
 */
export function acceptPublicMapboxToken(raw: string | undefined | null): string {
  const token = (raw ?? '').trim();
  if (!token) return '';
  if (token.startsWith('sk.')) return '';
  if (!token.startsWith('pk.')) return '';
  return token;
}

/**
 * Prefer MAPBOX_ACCESS_TOKEN; fall back to legacy MAPS_API_KEY when it is a pk.
 */
export function resolveMapboxPublicToken(source: {
  MAPBOX_ACCESS_TOKEN?: string;
  MAPS_API_KEY?: string;
}): string {
  return (
    acceptPublicMapboxToken(source.MAPBOX_ACCESS_TOKEN) ||
    acceptPublicMapboxToken(source.MAPS_API_KEY)
  );
}
