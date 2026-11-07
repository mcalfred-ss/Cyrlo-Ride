import { describe, expect, it } from 'vitest';

import {
  isPaystackRefundEventType,
  mapPaystackRefundStatus,
  parsePaystackRefundWebhookPayload,
} from './paystack-refunds.js';

describe('paystack refund payload adapter', () => {
  it('recognizes refund event types only', () => {
    expect(isPaystackRefundEventType('refund.processed')).toBe(true);
    expect(isPaystackRefundEventType('refund.failed')).toBe(true);
    expect(isPaystackRefundEventType('charge.success')).toBe(false);
  });

  it('maps provider statuses without treating pending as success', () => {
    expect(mapPaystackRefundStatus('processed')).toBe('processed');
    expect(mapPaystackRefundStatus('pending')).toBe('pending');
    expect(mapPaystackRefundStatus('processing')).toBe('pending');
    expect(mapPaystackRefundStatus('failed')).toBe('failed');
  });

  it('parses refund webhook payloads separately from charge.success', () => {
    const parsed = parsePaystackRefundWebhookPayload({
      event: 'refund.processed',
      data: {
        id: 99,
        status: 'processed',
        amount: 100,
        currency: 'GHS',
        transaction: { reference: 'bf_abc' },
      },
    });
    expect(parsed).toMatchObject({
      providerRefundId: '99',
      status: 'processed',
      transactionReference: 'bf_abc',
      amountPesewas: 100,
      currency: 'GHS',
    });
  });
});
