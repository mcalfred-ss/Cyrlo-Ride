import { apiRequest } from './client';
import type {
  AdminPassengerBookingsQuery,
  AdminPassengerBookingsResponse,
  AdminPassengerCancellationsQuery,
  AdminPassengerCancellationsResponse,
  AdminPassengerListResponse,
  AdminPassengerProfile,
  AdminPassengersQuery,
} from './types';

function appendPagination(
  params: URLSearchParams,
  query: { page?: number; pageSize?: number },
): void {
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
}

/** `GET /admin/passengers` — directory (ViewBookingHistory). */
export function fetchAdminPassengers(
  query: AdminPassengersQuery = {},
): Promise<AdminPassengerListResponse> {
  const params = new URLSearchParams();
  appendPagination(params, query);
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  const qs = params.toString();
  return apiRequest<AdminPassengerListResponse>(`/admin/passengers${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/** `GET /admin/passengers/:passengerId` — profile (no home lat/lng). */
export function fetchAdminPassenger(passengerId: string): Promise<AdminPassengerProfile> {
  return apiRequest<AdminPassengerProfile>(
    `/admin/passengers/${encodeURIComponent(passengerId)}`,
    { method: 'GET' },
  );
}

/** `GET /admin/passengers/:passengerId/bookings` — ordinary history omits exact coords. */
export function fetchPassengerBookings(
  passengerId: string,
  query: AdminPassengerBookingsQuery = {},
): Promise<AdminPassengerBookingsResponse> {
  const params = new URLSearchParams();
  appendPagination(params, query);
  const qs = params.toString();
  return apiRequest<AdminPassengerBookingsResponse>(
    `/admin/passengers/${encodeURIComponent(passengerId)}/bookings${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  );
}

/** `GET /admin/passengers/:passengerId/cancellations` — cancellation requests for the passenger. */
export function fetchPassengerCancellations(
  passengerId: string,
  query: AdminPassengerCancellationsQuery = {},
): Promise<AdminPassengerCancellationsResponse> {
  const params = new URLSearchParams();
  appendPagination(params, query);
  const qs = params.toString();
  return apiRequest<AdminPassengerCancellationsResponse>(
    `/admin/passengers/${encodeURIComponent(passengerId)}/cancellations${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  );
}
