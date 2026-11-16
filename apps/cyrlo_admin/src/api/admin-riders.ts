import { apiRequest } from './client';
import type {
  AdminPendingApplicationsResponse,
  AdminReviewDecisionInput,
  AdminRiderApplication,
  AdminRiderListResponse,
  AdminRiderProfile,
  AdminRidersQuery,
  AdminVehicleReviewResult,
} from './types';

export function fetchAdminRiders(query: AdminRidersQuery = {}): Promise<AdminRiderListResponse> {
  const params = new URLSearchParams();
  if (query.page != null) params.set('page', String(query.page));
  if (query.pageSize != null) params.set('pageSize', String(query.pageSize));
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.verificationStatus) params.set('verificationStatus', query.verificationStatus);
  if (query.availability) params.set('availability', query.availability);
  const qs = params.toString();
  return apiRequest<AdminRiderListResponse>(`/admin/riders${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export function fetchAdminRider(riderId: string): Promise<AdminRiderProfile> {
  return apiRequest<AdminRiderProfile>(`/admin/riders/${encodeURIComponent(riderId)}`, {
    method: 'GET',
  });
}

/** `GET /admin/riders/applications` — pending queue (`PENDING_REVIEW` only). */
export function fetchPendingApplications(): Promise<AdminPendingApplicationsResponse> {
  return apiRequest<AdminPendingApplicationsResponse>('/admin/riders/applications', {
    method: 'GET',
  });
}

/** `GET /admin/riders/applications/:riderId` — ops application detail. */
export function fetchRiderApplication(riderId: string): Promise<AdminRiderApplication> {
  return apiRequest<AdminRiderApplication>(
    `/admin/riders/applications/${encodeURIComponent(riderId)}`,
    { method: 'GET' },
  );
}

/**
 * `POST /admin/riders/applications/:riderId/review`
 *
 * Approval (`decision === 'APPROVED'`):
 * - Blocked with HTTP 409 if any vehicle is still `PENDING_REVIEW`.
 * - Blocked with HTTP 409 if the rider has no `APPROVED` vehicle.
 * - Requires at least one approved vehicle and that every vehicle has completed
 *   review (none remaining pending).
 * - Does not modify vehicle review statuses.
 *
 * Rejection (`decision === 'REJECTED'`) retains existing backend behavior:
 * still-pending vehicles are rejected with the application reason.
 *
 * This client sends the decision as-is; the backend enforces the rules above.
 */
export function reviewRiderApplication(
  riderId: string,
  input: AdminReviewDecisionInput,
): Promise<AdminRiderApplication> {
  return apiRequest<AdminRiderApplication>(
    `/admin/riders/applications/${encodeURIComponent(riderId)}/review`,
    { method: 'POST', body: input },
  );
}

/** `POST /admin/riders/vehicles/:vehicleId/review` — individual vehicle decision. */
export function reviewRiderVehicle(
  vehicleId: string,
  input: AdminReviewDecisionInput,
): Promise<AdminVehicleReviewResult> {
  return apiRequest<AdminVehicleReviewResult>(
    `/admin/riders/vehicles/${encodeURIComponent(vehicleId)}/review`,
    { method: 'POST', body: input },
  );
}
