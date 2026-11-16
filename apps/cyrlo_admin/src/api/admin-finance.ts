import { apiRequest } from './client';
import type {
  AdminFinancialReport,
  AdminPaymentRefund,
  AdminRefundReconciliationAttempt,
  AdminReconciliationCase,
  AnalyticsQuery,
  PaymentRefundStatus,
  ReconciliationCaseStatus,
} from './types';

export function fetchAdminFinancialReport(query: AnalyticsQuery = {}): Promise<AdminFinancialReport> {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const qs = params.toString();
  return apiRequest<AdminFinancialReport>(`/admin/financial-reports${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

/** Cap 100 rows; backend has no pagination schema. */
export function fetchAdminRefunds(status?: PaymentRefundStatus): Promise<AdminPaymentRefund[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return apiRequest<AdminPaymentRefund[]>(`/admin/payments/refunds${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  });
}

export function fetchRefundReconciliationAttempts(
  refundId: string,
): Promise<AdminRefundReconciliationAttempt[]> {
  return apiRequest<AdminRefundReconciliationAttempt[]>(
    `/admin/payments/refunds/${encodeURIComponent(refundId)}/reconciliation-attempts`,
    { method: 'GET' },
  );
}

export function executeAdminRefund(refundId: string): Promise<unknown> {
  return apiRequest(`/admin/payments/refunds/${encodeURIComponent(refundId)}/execute`, {
    method: 'POST',
    body: {},
  });
}

export function reconcileAdminRefund(refundId: string): Promise<unknown> {
  return apiRequest(`/admin/payments/refunds/${encodeURIComponent(refundId)}/reconcile`, {
    method: 'POST',
    body: {},
  });
}

export function fetchReconciliationCases(
  status?: ReconciliationCaseStatus,
): Promise<AdminReconciliationCase[]> {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  const qs = params.toString();
  return apiRequest<AdminReconciliationCase[]>(
    `/admin/payments/reconciliation/cases${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  );
}

export function resolveReconciliationCase(
  caseId: string,
  notes?: string,
): Promise<{ id: string; status: string; resolvedAt: string | null; notes: string | null }> {
  return apiRequest(`/admin/payments/reconciliation/cases/${encodeURIComponent(caseId)}/resolve`, {
    method: 'POST',
    body: notes !== undefined ? { notes } : {},
  });
}
