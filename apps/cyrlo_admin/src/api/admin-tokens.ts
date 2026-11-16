import { apiRequest } from './client';
import type {
  AdminTokenLedgersResponse,
  AdminTokenPackage,
  AdminTokenPurchasesResponse,
  CreateTokenPackageInput,
  TokenLedgerType,
  TokenPurchaseStatus,
  UpdateTokenPackageInput,
} from './types';

export function fetchTokenPackages(): Promise<AdminTokenPackage[]> {
  return apiRequest<AdminTokenPackage[]>('/admin/token-packages', { method: 'GET' });
}

export function createTokenPackage(input: CreateTokenPackageInput): Promise<AdminTokenPackage> {
  return apiRequest<AdminTokenPackage>('/admin/token-packages', {
    method: 'POST',
    body: input,
  });
}

export function updateTokenPackage(
  packageId: string,
  input: UpdateTokenPackageInput,
): Promise<AdminTokenPackage> {
  return apiRequest<AdminTokenPackage>(
    `/admin/token-packages/${encodeURIComponent(packageId)}`,
    { method: 'PATCH', body: input },
  );
}

export function fetchTokenPurchases(query: {
  page?: number;
  pageSize?: number;
  status?: TokenPurchaseStatus;
} = {}): Promise<AdminTokenPurchasesResponse> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  if (query.status) params.set('status', query.status);
  return apiRequest<AdminTokenPurchasesResponse>(`/admin/token-purchases?${params}`, {
    method: 'GET',
  });
}

export function fetchTokenLedgers(query: {
  page?: number;
  pageSize?: number;
  riderId?: string;
  type?: TokenLedgerType;
  from?: string;
  to?: string;
} = {}): Promise<AdminTokenLedgersResponse> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 20));
  if (query.riderId) params.set('riderId', query.riderId);
  if (query.type) params.set('type', query.type);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  return apiRequest<AdminTokenLedgersResponse>(`/admin/token-ledgers?${params}`, {
    method: 'GET',
  });
}
