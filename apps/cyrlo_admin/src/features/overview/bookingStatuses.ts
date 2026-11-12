/** Known booking statuses from backend admin booking filters — used to zero-fill sparse maps. */
export const BOOKING_STATUSES = [
  'AWAITING_PAYMENT',
  'PAYMENT_FAILED',
  'SEARCHING',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'EXPIRED',
  'CANCELLED',
] as const;

export type BookingStatusKey = (typeof BOOKING_STATUSES)[number];

export function bookingStatusRows(byStatus: Record<string, number>): {
  status: string;
  count: number;
}[] {
  const known = new Set<string>(BOOKING_STATUSES);
  const rows: { status: string; count: number }[] = BOOKING_STATUSES.map((status) => ({
    status,
    count: byStatus[status] ?? 0,
  }));
  for (const [status, count] of Object.entries(byStatus)) {
    if (!known.has(status)) {
      rows.push({ status, count });
    }
  }
  return rows;
}
