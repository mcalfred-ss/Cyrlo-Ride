import { describe, expect, it, vi } from 'vitest';

import { MATCHING_RADIUS_METERS } from '../../config/constants.js';
import { MatchingServiceImpl } from './module.service.js';

function baseRider(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    userId: 'rider-1',
    fullName: 'Kwame Boateng',
    verificationStatus: 'APPROVED',
    availability: 'AVAILABLE',
    user: { status: 'ACTIVE' },
    wallet: { tokenBalance: 3 },
    vehicles: [{ id: 'v1' }],
    bookings: [],
    location: {
      sharingEnabled: true,
      recordedAt: now,
      receivedAt: now,
      latitude: 6.6885,
      longitude: -1.6244,
    },
    ...overrides,
  };
}

describe('MatchingService.discoverNearby', () => {
  it('returns empty when pickup is outside ACTIVE service area', async () => {
    const repository = {
      findActiveZoneCoveringPickup: vi.fn().mockResolvedValue(null),
      loadMatchingCandidates: vi.fn(),
    };
    const service = new MatchingServiceImpl(repository as never, {
      audit: { record: vi.fn() } as never,
      prisma: {} as never,
      bookings: {} as never,
    });

    const result = (await service.discoverNearby({
      pickup: { latitude: 6.6885, longitude: -1.6244 },
      vehicleCategory: 'PRAGYA',
    })) as { inServiceArea: boolean; riders: unknown[] };

    expect(result.inServiceArea).toBe(false);
    expect(result.riders).toEqual([]);
    expect(repository.loadMatchingCandidates).not.toHaveBeenCalled();
  });

  it('returns approximate coords only for eligible fresh riders within 5 km', async () => {
    const now = new Date();
    const repository = {
      findActiveZoneCoveringPickup: vi.fn().mockResolvedValue({
        id: 'zone-1',
        createdAt: now,
      }),
      loadMatchingCandidates: vi.fn().mockResolvedValue([
        baseRider(),
        baseRider({
          userId: 'rider-stale',
          fullName: 'Stale',
          location: {
            sharingEnabled: true,
            recordedAt: new Date(now.getTime() - 60_000),
            receivedAt: new Date(now.getTime() - 60_000),
            latitude: 6.6885,
            longitude: -1.6244,
          },
        }),
        baseRider({
          userId: 'rider-far',
          fullName: 'Far',
          location: {
            sharingEnabled: true,
            recordedAt: now,
            receivedAt: now,
            latitude: 6.8,
            longitude: -1.6244,
          },
        }),
        baseRider({
          userId: 'rider-offline',
          availability: 'OFFLINE',
        }),
      ]),
    };
    const service = new MatchingServiceImpl(repository as never, {
      audit: { record: vi.fn() } as never,
      prisma: {} as never,
      bookings: {} as never,
      now: () => now,
    });

    const result = (await service.discoverNearby({
      pickup: { latitude: 6.6885, longitude: -1.6244 },
      vehicleCategory: 'PRAGYA',
    })) as {
      inServiceArea: boolean;
      radiusMeters: number;
      riders: Array<{
        id: string;
        displayName: string;
        approximate: { latitude: number; longitude: number };
        phoneE164?: string;
        latitude?: number;
      }>;
    };

    expect(result.inServiceArea).toBe(true);
    expect(result.radiusMeters).toBe(MATCHING_RADIUS_METERS);
    expect(result.riders).toHaveLength(1);
    expect(result.riders[0]!.id).toBe('rider-1');
    expect(result.riders[0]!.displayName).toBe('Kwame');
    expect(result.riders[0]!.phoneE164).toBeUndefined();
    expect(result.riders[0]!.latitude).toBeUndefined();
    expect(result.riders[0]!.approximate).toEqual(
      expect.objectContaining({
        latitude: expect.any(Number),
        longitude: expect.any(Number),
      }),
    );
  });

  it('dedupes riders and never invents rows when candidates are empty', async () => {
    const repository = {
      findActiveZoneCoveringPickup: vi.fn().mockResolvedValue({
        id: 'zone-1',
        createdAt: new Date(),
      }),
      loadMatchingCandidates: vi.fn().mockResolvedValue([]),
    };
    const service = new MatchingServiceImpl(repository as never, {
      audit: { record: vi.fn() } as never,
      prisma: {} as never,
      bookings: {} as never,
    });

    const result = (await service.discoverNearby({
      pickup: { latitude: 6.69, longitude: -1.62 },
      vehicleCategory: 'PRAGYA',
    })) as { riders: unknown[] };

    expect(result.riders).toEqual([]);
  });
});
