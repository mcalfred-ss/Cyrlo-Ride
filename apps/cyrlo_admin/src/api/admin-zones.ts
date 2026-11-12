import { apiRequest } from './client';
import type { AdminServiceZone, ServiceZoneStatus } from './types';

export interface AdminServiceZonesResponse {
  items: AdminServiceZone[];
  meta: { page: number; pageSize: number; total: number; hasNextPage: boolean };
}

export function fetchServiceZones(query: {
  page?: number;
  pageSize?: number;
  isActive?: boolean;
  status?: ServiceZoneStatus;
  communityId?: string;
  q?: string;
} = {}): Promise<AdminServiceZonesResponse> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.status) params.set('status', query.status);
  if (query.communityId) params.set('communityId', query.communityId);
  if (query.q) params.set('q', query.q);
  return apiRequest<AdminServiceZonesResponse>(`/admin/service-zones?${params}`, { method: 'GET' });
}

export function fetchServiceZone(zoneId: string): Promise<AdminServiceZone> {
  return apiRequest<AdminServiceZone>(`/admin/service-zones/${encodeURIComponent(zoneId)}`, {
    method: 'GET',
  });
}

export function submitZoneReview(zoneId: string): Promise<AdminServiceZone> {
  return apiRequest<AdminServiceZone>(
    `/admin/service-zones/${encodeURIComponent(zoneId)}/submit-review`,
    { method: 'POST', body: {} },
  );
}

export function verifyServiceZone(zoneId: string): Promise<AdminServiceZone> {
  return apiRequest<AdminServiceZone>(
    `/admin/service-zones/${encodeURIComponent(zoneId)}/verify`,
    { method: 'POST', body: {} },
  );
}

export function lockServiceZone(zoneId: string): Promise<AdminServiceZone> {
  return apiRequest<AdminServiceZone>(
    `/admin/service-zones/${encodeURIComponent(zoneId)}/lock`,
    { method: 'POST', body: {} },
  );
}

export function suspendServiceZone(zoneId: string): Promise<AdminServiceZone> {
  return apiRequest<AdminServiceZone>(
    `/admin/service-zones/${encodeURIComponent(zoneId)}/suspend`,
    { method: 'POST', body: {} },
  );
}

export function activateServiceZone(zoneId: string): Promise<AdminServiceZone> {
  return apiRequest<AdminServiceZone>(
    `/admin/service-zones/${encodeURIComponent(zoneId)}/activate`,
    { method: 'POST', body: {} },
  );
}

export function deactivateServiceZone(zoneId: string): Promise<AdminServiceZone> {
  return apiRequest<AdminServiceZone>(
    `/admin/service-zones/${encodeURIComponent(zoneId)}/deactivate`,
    { method: 'POST', body: {} },
  );
}
