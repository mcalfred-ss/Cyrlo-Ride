import { apiRequest } from './client';
import type { AdminServiceZone, ServiceZoneStatus } from './types';

export interface AdminServiceZonesResponse {
  items: AdminServiceZone[];
  meta: { page: number; pageSize: number; total: number; hasNextPage: boolean };
}

/** Backend allows 1..100 per page. */
export const MAX_ZONE_PAGE_SIZE = 100;

function clampPageSize(pageSize: number | undefined): number {
  if (pageSize === undefined || !Number.isFinite(pageSize)) return 20;
  return Math.min(MAX_ZONE_PAGE_SIZE, Math.max(1, Math.trunc(pageSize)));
}

export function fetchServiceZones(query: {
  page?: number;
  pageSize?: number;
  isActive?: boolean;
  status?: ServiceZoneStatus;
  communityId?: string;
  districtId?: string;
  regionId?: string;
  q?: string;
} = {}): Promise<AdminServiceZonesResponse> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(clampPageSize(query.pageSize)));
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive));
  if (query.status) params.set('status', query.status);
  if (query.communityId) params.set('communityId', query.communityId);
  if (query.districtId) params.set('districtId', query.districtId);
  if (query.regionId) params.set('regionId', query.regionId);
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

export type ZoneRiderApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export interface ZoneRiderApproval {
  approvalId: string;
  riderId: string;
  fullName: string;
  phoneNumber: string;
  riderAccountStatus: string;
  riderVerificationStatus: string;
  status: ZoneRiderApprovalStatus;
  reason: string | null;
  decidedAt: string | null;
  updatedAt: string;
}

/** `GET /admin/service-zones/:zoneId/rider-approvals` — requires ManageServiceZones. */
export function listZoneRiders(zoneId: string): Promise<ZoneRiderApproval[]> {
  return apiRequest<ZoneRiderApproval[]>(
    `/admin/service-zones/${encodeURIComponent(zoneId)}/rider-approvals`,
    { method: 'GET' },
  );
}
