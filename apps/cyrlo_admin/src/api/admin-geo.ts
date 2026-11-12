import { apiRequest } from './client';

export interface GeoTreeNode {
  id: string;
  name: string;
  code?: string | null;
  children?: GeoTreeNode[];
  [key: string]: unknown;
}

export function fetchGeoTree(query: { countryId?: string } = {}): Promise<unknown> {
  const params = new URLSearchParams();
  if (query.countryId) params.set('countryId', query.countryId);
  const qs = params.toString();
  return apiRequest(`/admin/geo/tree${qs ? `?${qs}` : ''}`, { method: 'GET' });
}

export function fetchGeoCountries(query: { page?: number; pageSize?: number } = {}): Promise<unknown> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 50));
  return apiRequest(`/admin/geo?${params}`, { method: 'GET' });
}

export function fetchGeoRegions(query: {
  page?: number;
  pageSize?: number;
  countryId?: string;
} = {}): Promise<unknown> {
  const params = new URLSearchParams();
  params.set('page', String(query.page ?? 1));
  params.set('pageSize', String(query.pageSize ?? 50));
  if (query.countryId) params.set('countryId', query.countryId);
  return apiRequest(`/admin/geo/regions?${params}`, { method: 'GET' });
}
