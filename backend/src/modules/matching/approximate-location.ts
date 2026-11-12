/**
 * Privacy: snap exact rider GPS to a coarse grid before exposing to passengers.
 * Cell size ~300 m — enough for map presence without revealing precise position.
 */
export const PASSENGER_MAP_APPROX_CELL_METERS = 300;

export function approximateCoordinate(
  latitude: number,
  longitude: number,
  cellMeters: number = PASSENGER_MAP_APPROX_CELL_METERS,
): { latitude: number; longitude: number } {
  const latCell = cellMeters / 111_320;
  const snappedLatitude = Math.round(latitude / latCell) * latCell;
  // Use snapped latitude so nearby points share one longitude grid.
  const cosLat = Math.cos((snappedLatitude * Math.PI) / 180);
  const lngCell = cellMeters / (111_320 * Math.max(0.2, Math.abs(cosLat)));
  return {
    latitude: snappedLatitude,
    longitude: Math.round(longitude / lngCell) * lngCell,
  };
}

/** Public first-name only (or category label) — never a phone number. */
export function publicRiderDisplayName(
  fullName: string | null | undefined,
  vehicleCategory: string,
): string {
  const first = fullName?.trim().split(/\s+/)[0];
  if (first && first.length >= 2) return first;
  const label =
    vehicleCategory === 'OKADA'
      ? 'Okada'
      : vehicleCategory === 'ABOBOYAA'
        ? 'Aboboyaa'
        : 'Pragya';
  return `${label} rider`;
}

/** ETA band from haversine distance; assumes ~25 km/h urban two-wheeler. */
export function etaMinutesFromDistance(distanceMeters: number): number {
  const minutes = Math.ceil(distanceMeters / ((25_000 / 60)));
  return Math.min(60, Math.max(1, minutes));
}
