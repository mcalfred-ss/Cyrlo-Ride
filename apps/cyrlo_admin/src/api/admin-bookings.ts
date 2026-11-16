import { apiRequest } from './client';
import type {
  AdminBookingDetail,
  AdminBookingListResponse,
  AdminBookingsQuery,
} from './types';

/** `GET /admin/bookings` — directory (ViewBookingHistory). Ordinary payloads omit exact coords. */
export function fetchAdminBookings(
  query: AdminBookingsQuery = {},
): Promise<AdminBookingListResponse> {
  const params = new URLSearchParams();
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
  if (query.status) params.set('status', query.status);
  if (query.passengerId) params.set('passengerId', query.passengerId);
  if (query.riderId) params.set('riderId', query.riderId);
  if (query.serviceZoneId) params.set('serviceZoneId', query.serviceZoneId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const qs = params.toString();
  return apiRequest<AdminBookingListResponse>(`/admin/bookings${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/** `GET /admin/bookings/:bookingId` — detail + payments + status history (no exact coords). */
export function fetchAdminBooking(bookingId: string): Promise<AdminBookingDetail> {
  return apiRequest<AdminBookingDetail>(
    `/admin/bookings/${encodeURIComponent(bookingId)}`,
    { method: 'GET' },
  );
}
