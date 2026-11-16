import { apiRequest } from './client';
import type { AdminAnalytics, AnalyticsQuery } from './types';

export function fetchAdminAnalytics(query: AnalyticsQuery = {}): Promise<AdminAnalytics> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const qs = params.toString();
  return apiRequest<AdminAnalytics>(`/admin/analytics${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}
