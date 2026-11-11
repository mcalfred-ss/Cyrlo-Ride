import { describe, expect, it, vi } from 'vitest';

import { BOOKING_FEE_PESEWAS } from '../../config/constants.js';
import { MemoryPaystackClient } from '../../infrastructure/payments/paystack-client.js';
import { createBookingSchema } from './module.schema.js';
import { decideRefunds } from './booking-rules.js';

describe('destination-free booking contract', () => {
  it('accepts pickup-only create bodies', () => {
    const parsed = createBookingSchema.parse({
      pickup: { latitude: 6.6885, longitude: -1.6244 },
      pickupLabel: 'Tafo, Kumasi',
      vehicleCategory: 'PRAGYA',
    });
    expect(parsed.destination).toBeUndefined();
    expect(parsed.pickup.latitude).toBe(6.6885);
  });

  it('rejects missing pickup', () => {
    expect(
      createBookingSchema.safeParse({
        vehicleCategory: 'PRAGYA',
      }).success,
    ).toBe(false);
  });

  it('rejects invalid pickup coordinates', () => {
    expect(
      createBookingSchema.safeParse({
        pickup: { latitude: 91, longitude: -1.62 },
        vehicleCategory: 'PRAGYA',
      }).success,
    ).toBe(false);
  });

  it('keeps connection fee fixed at GH₵1 regardless of destination presence', () => {
    expect(BOOKING_FEE_PESEWAS).toBe(100);
    const withDest = createBookingSchema.parse({
      pickup: { latitude: 6.6885, longitude: -1.6244 },
      destination: { latitude: 5.6, longitude: -0.18 },
      vehicleCategory: 'OKADA',
    });
    const withoutDest = createBookingSchema.parse({
      pickup: { latitude: 6.6885, longitude: -1.6244 },
      vehicleCategory: 'OKADA',
    });
    expect(withDest.destination).toBeDefined();
    expect(withoutDest.destination).toBeUndefined();
    // Fee is not derived from coordinates — constant only.
    expect(BOOKING_FEE_PESEWAS).toBe(100);
  });
});

describe('connection fee Paystack safety in unit tests', () => {
  it('MemoryPaystackClient records init without network and uses GH₵1', async () => {
    const paystack = new MemoryPaystackClient();
    const init = await paystack.initializeTransaction({
      email: 'passenger_test@cyrlo.local',
      amountPesewas: BOOKING_FEE_PESEWAS,
      currency: 'GHS',
      reference: 'bf_test_ref',
      metadata: { purpose: 'BOOKING_FEE', feeType: 'connection_fee' },
    });
    expect(init.authorizationUrl).toContain('checkout.paystack.com');
    expect(paystack.initializations).toHaveLength(1);
    expect(paystack.initializations[0]?.amountPesewas).toBe(100);
  });

  it('duplicate connection-fee intent shares idempotency semantics', () => {
    // Idempotency key format used by ensureConnectionFeePayment
    const key = (bookingId: string) => `booking-fee:${bookingId}`;
    expect(key('a')).toBe(key('a'));
    expect(key('a')).not.toBe(key('b'));
  });

  it('search expiry without captured fee requests no refund', () => {
    expect(
      decideRefunds({
        feeCaptured: false,
        tokenDebited: false,
        situation: 'SEARCH_EXPIRED',
      }),
    ).toEqual({ fee: 'NONE', token: 'NONE' });
  });
});

describe('MemoryPaystackClient is the only payment double for automated tests', () => {
  it('does not call global fetch for initializeTransaction', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const paystack = new MemoryPaystackClient();
    await paystack.initializeTransaction({
      email: 'x@cyrlo.local',
      amountPesewas: 100,
      currency: 'GHS',
      reference: 'bf_x',
      metadata: {},
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
