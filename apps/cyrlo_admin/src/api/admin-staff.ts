import { apiRequest } from './client';
import type {
  AdminAuditLogsResponse,
  CreateAdminInvitationInput,
  CreateAdminInvitationResult,
  RevokeAdminInput,
} from './types';

export function fetchAuditLogs(query: {
  page?: number;
  pageSize?: number;
  actorId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
} = {}): Promise<AdminAuditLogsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  if (query.actorId) params.set('actorId', query.actorId);
  if (query.action) params.set('action', query.action);
  if (query.entityType) params.set('entityType', query.entityType);
  if (query.entityId) params.set('entityId', query.entityId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return apiRequest<AdminAuditLogsResponse>(`/admin/audit-logs?${params}`, { method: 'GET' });
}

export function createAdminInvitation(
  input: CreateAdminInvitationInput,
): Promise<CreateAdminInvitationResult> {
  return apiRequest<CreateAdminInvitationResult>('/admin/invitations', {
    method: 'POST',
    body: input,
  });
}

export function revokeAdminGrant(input: RevokeAdminInput): Promise<unknown> {
  return apiRequest('/admin/grants/revoke', {
    method: 'POST',
    body: input,
  });
}
