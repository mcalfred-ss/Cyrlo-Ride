import { apiRequest } from './client';
import type { AdminRiderListResponse, AdminRiderProfile, AdminRidersQuery } from './types';

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
