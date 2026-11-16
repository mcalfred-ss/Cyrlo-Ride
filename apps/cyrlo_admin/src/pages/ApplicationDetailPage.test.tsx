import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { setUnauthorizedHandler } from '../api/client';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import { privilegedAccessToken } from '../test/jwt';
import { ApplicationDetailPage } from './ApplicationDetailPage';

function jsonOk(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      status: 200,
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

function sampleApp(overrides: Record<string, unknown> = {}) {
  return {
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
        kind: 'RIDER_PHOTO',
        vehicleId: null,
        contentType: 'image/jpeg',
        sizeBytes: 10,
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
    ...overrides,
  };
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={[`/applications/${riderId}`]}>
      <Routes>
        <Route path="/applications" element={<div>queue-screen</div>} />
        <Route path="/applications/:riderId" element={<ApplicationDetailPage />} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ApplicationDetailPage', () => {
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

  it('renders detail without Ghana Card number and blocks approval while vehicle pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(sampleApp())));
    const { container } = renderDetail();
    expect(await screen.findByTestId('application-detail')).toBeInTheDocument();
    expect(screen.getByTestId('application-approve-blocked')).toBeInTheDocument();
    expect(screen.getByTestId('application-approve')).toBeDisabled();
    expect(container.textContent).not.toMatch(/GHA-\d/);
    expect(screen.getByText(/Yes \(not revealed\)/)).toBeInTheDocument();
  });

  it('approves a vehicle then allows application approval', async () => {
    const user = userEvent.setup();
    let app = sampleApp();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(`/vehicles/${vehicleId}/review`) && init?.method === 'POST') {
        app = sampleApp({
          vehicles: [
            {
              ...app.vehicles[0],
              verificationStatus: 'APPROVED',
            },
          ],
          reviewHistory: [
            {
              id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
              decision: 'APPROVED',
              reason: null,
              vehicleId,
              createdAt: '2026-11-12T12:00:00.000Z',
              actorId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
            },
          ],
        });
        return jsonOk({
          id: vehicleId,
          category: 'OKADA',
          registrationNumber: 'GR-1',
          make: 'Honda',
          model: 'CG',
          colour: 'Red',
          capacity: 1,
          verificationStatus: 'APPROVED',
          rejectionReason: null,
        });
      }
      if (url.includes(`/applications/${riderId}/review`) && init?.method === 'POST') {
        return jsonOk(sampleApp({ verificationStatus: 'APPROVED' }));
      }
      if (url.includes(`/applications/${riderId}`)) {
        return jsonOk(app);
      }
      return jsonOk(app);
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDetail();
    await screen.findByTestId('application-detail');
    await user.click(screen.getByTestId(`vehicle-approve-${vehicleId}`));
    await user.click(screen.getByTestId('review-confirm-confirm'));
    await waitFor(() => {
      expect(screen.getByTestId('application-flash')).toBeInTheDocument();
    });
    expect(screen.getByTestId('application-approve')).not.toBeDisabled();
    await user.click(screen.getByTestId('application-approve'));
    await user.click(screen.getByTestId('review-confirm-confirm'));
    expect(await screen.findByText('queue-screen')).toBeInTheDocument();
  });

  it('requires rejection reason and surfaces 409 on premature approval', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/review') && init?.method === 'POST') {
        return jsonErr(
          409,
          'CONFLICT',
          'All vehicles must be individually reviewed before application approval',
        );
      }
      return jsonOk(
        sampleApp({
          vehicles: [
            {
              id: vehicleId,
              category: 'OKADA',
              registrationNumber: 'GR-1',
              make: 'Honda',
              model: 'CG',
              colour: 'Red',
              capacity: 1,
              verificationStatus: 'APPROVED',
              rejectionReason: null,
            },
          ],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    // Force approve button enabled by loading approved vehicle, then 409 from server.
    renderDetail();
    await screen.findByTestId('application-detail');
    await user.click(screen.getByTestId('application-reject'));
    expect(screen.getByTestId('review-confirm-confirm')).toBeDisabled();
    await user.type(screen.getByTestId('review-confirm-reason'), 'Blurry docs');
    expect(screen.getByTestId('review-confirm-confirm')).not.toBeDisabled();
    await user.click(screen.getByTestId('review-confirm-cancel'));

    await user.click(screen.getByTestId('application-approve'));
    await user.click(screen.getByTestId('review-confirm-confirm'));
    expect(await screen.findByTestId('review-confirm-error')).toHaveTextContent(
      /individually reviewed/i,
    );
  });

  it('prevents duplicate vehicle submit while busy', async () => {
    const user = userEvent.setup();
    let resolveReview!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveReview = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes('/vehicles/') && init?.method === 'POST') return pending;
        return jsonOk(sampleApp());
      }),
    );
    renderDetail();
    await screen.findByTestId('application-detail');
    await user.click(screen.getByTestId(`vehicle-approve-${vehicleId}`));
    await user.click(screen.getByTestId('review-confirm-confirm'));
    expect(screen.getByTestId('review-confirm-confirm')).toBeDisabled();
    expect(screen.getByTestId('review-confirm-confirm')).toHaveTextContent('Submitting…');
    resolveReview(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: vehicleId,
            category: 'OKADA',
            registrationNumber: 'GR-1',
            make: 'Honda',
            model: 'CG',
            colour: 'Red',
            capacity: 1,
            verificationStatus: 'APPROVED',
            rejectionReason: null,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    await waitFor(() => {
      expect(screen.queryByTestId('review-confirm')).not.toBeInTheDocument();
    });
  });
});
