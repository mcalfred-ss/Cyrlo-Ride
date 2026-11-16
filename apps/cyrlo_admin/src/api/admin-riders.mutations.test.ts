import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import {
  fetchPendingApplications,
  fetchRiderApplication,
  reviewRiderApplication,
  reviewRiderVehicle,
} from './admin-riders';
import { setUnauthorizedHandler } from './client';
import { ApiError } from './types';
import type { AdminRiderApplication, AdminVehicleReviewResult } from './types';

function jsonOk(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function jsonErr(status: number, code: string, message: string) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: false, error: { code, message } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

const riderId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const vehicleId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const sampleApplication: AdminRiderApplication = {
  riderId,
  fullName: 'Kofi Applicant',
  verificationStatus: 'PENDING_REVIEW',
  driversLicenceNumber: 'DL-1',
  driversLicenceExpiry: '2030-01-01T00:00:00.000Z',
  submittedAt: '2026-11-01T10:00:00.000Z',
  hasEncryptedGhanaCard: true,
  ghanaCardNumber: null,
  documents: [
    {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      kind: 'GHANA_CARD',
      vehicleId: null,
      contentType: 'application/pdf',
      sizeBytes: 12,
      createdAt: '2026-11-01T09:00:00.000Z',
    },
  ],
  vehicles: [
    {
      id: vehicleId,
      category: 'OKADA',
      registrationNumber: 'GR-1',
      make: 'Honda',
      model: 'CG',
      colour: 'Red',
      capacity: 1,
      verificationStatus: 'PENDING_REVIEW',
      rejectionReason: null,
    },
  ],
  reviewHistory: [],
};

const sampleVehicleResult: AdminVehicleReviewResult = {
  id: vehicleId,
  category: 'OKADA',
  registrationNumber: 'GR-1',
  make: 'Honda',
  model: 'CG',
  colour: 'Red',
  capacity: 1,
  verificationStatus: 'APPROVED',
  rejectionReason: null,
};

describe('admin rider review API clients', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'OPERATIONS_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
  });

  it('GETs pending applications at the correct path', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk([
        {
          riderId,
          fullName: 'Kofi Applicant',
          phoneNumber: '+233201000001',
          status: 'ACTIVE',
          verificationStatus: 'PENDING_REVIEW',
          submittedAt: '2026-11-01T10:00:00.000Z',
          vehicleCount: 1,
        },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchPendingApplications();
    expect(data).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/admin/riders/applications',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('GETs application detail by rider id', async () => {
    const fetchMock = vi.fn(async () => jsonOk(sampleApplication));
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchRiderApplication(riderId);
    expect(data.ghanaCardNumber).toBeNull();
    expect(data.reviewHistory).toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/riders/applications/${riderId}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POSTs application approval without a reason body field when omitted', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({ ...sampleApplication, verificationStatus: 'APPROVED' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reviewRiderApplication(riderId, { decision: 'APPROVED' });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/riders/applications/${riderId}/review`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED' }),
      }),
    );
  });

  it('POSTs application rejection with required reason serialized', async () => {
    const fetchMock = vi.fn(async () =>
      jsonOk({ ...sampleApplication, verificationStatus: 'REJECTED' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await reviewRiderApplication(riderId, {
      decision: 'REJECTED',
      reason: 'Blurry Ghana Card photo',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/riders/applications/${riderId}/review`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          decision: 'REJECTED',
          reason: 'Blurry Ghana Card photo',
        }),
      }),
    );
  });

  it('POSTs vehicle review decisions to the vehicles review path', async () => {
    const fetchMock = vi.fn(async () => jsonOk(sampleVehicleResult));
    vi.stubGlobal('fetch', fetchMock);

    const data = await reviewRiderVehicle(vehicleId, { decision: 'APPROVED' });
    expect(data.verificationStatus).toBe('APPROVED');
    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/admin/riders/vehicles/${vehicleId}/review`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ decision: 'APPROVED' }),
      }),
    );
  });

  it('propagates 409 conflicts from application review', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(409, 'CONFLICT', 'Application is not pending review')),
    );

    await expect(reviewRiderApplication(riderId, { decision: 'APPROVED' })).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      message: 'Application is not pending review',
    });
    await expect(reviewRiderApplication(riderId, { decision: 'APPROVED' })).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('propagates 403 from application review without fabricating data', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'Missing ReviewRiders')));

    await expect(fetchPendingApplications()).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
  });

  it('propagates privileged 401 through the shared client', async () => {
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));

    await expect(fetchRiderApplication(riderId)).rejects.toMatchObject({ status: 401 });
    expect(unauthorized).toHaveBeenCalledTimes(1);
  });
});
