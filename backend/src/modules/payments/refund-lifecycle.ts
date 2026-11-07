import type { PaymentRefundStatus } from '@prisma/client';

import type { ParsedPaystackRefundStatus } from '../../infrastructure/payments/paystack-refunds.js';

/** Stale PROCESSING locks older than this may be reclaimed by the sweeper. */
export const REFUND_STALE_PROCESSING_MS = 120_000;

export const REFUND_BASE_BACKOFF_MS = 5_000;
export const REFUND_MAX_BACKOFF_MS = 300_000;

export function computeRefundBackoffMs(attemptNumber: number): number {
  const exp = Math.max(0, attemptNumber - 1);
  return Math.min(REFUND_MAX_BACKOFF_MS, REFUND_BASE_BACKOFF_MS * 2 ** exp);
}

/**
 * Map trusted provider status onto local refund transitions.
 * SUCCEEDED only from processed confirmation — never from mere submission.
 */
export function localStatusFromProvider(
  providerStatus: ParsedPaystackRefundStatus,
): Extract<PaymentRefundStatus, 'PROCESSING' | 'SUCCEEDED' | 'FAILED'> | null {
  if (providerStatus === 'processed') return 'SUCCEEDED';
  if (providerStatus === 'failed') return 'FAILED';
  if (providerStatus === 'pending') return 'PROCESSING';
  return null;
}

export function isTerminalRefundStatus(status: PaymentRefundStatus): boolean {
  return status === 'SUCCEEDED' || status === 'MANUAL_RECONCILIATION';
}

/** Whether status alone allows a submit attempt (authorization is separate). */
export function isRefundEligibleForSubmit(status: PaymentRefundStatus): boolean {
  return status === 'REQUESTED' || status === 'FAILED';
}

/**
 * Worker / claim boundary: Paystack submit requires both an executable status
 * and an explicit authorization timestamp (Finance MFA path or matrix policy).
 */
export function isRefundAuthorizedForExecution(refund: {
  status: PaymentRefundStatus;
  authorizedAt: Date | null;
}): boolean {
  return isRefundEligibleForSubmit(refund.status) && refund.authorizedAt != null;
}

export const RECON_CASE_TYPES = {
  ABANDONED_TOKEN_PURCHASE_SUCCESS: 'ABANDONED_TOKEN_PURCHASE_SUCCESS',
  BOOKING_FEE_SUCCESS_WITHOUT_REFUND: 'BOOKING_FEE_SUCCESS_WITHOUT_REFUND',
  REFUND_PROVIDER_DISCREPANCY: 'REFUND_PROVIDER_DISCREPANCY',
  REFUND_MANUAL_REVIEW: 'REFUND_MANUAL_REVIEW',
} as const;
