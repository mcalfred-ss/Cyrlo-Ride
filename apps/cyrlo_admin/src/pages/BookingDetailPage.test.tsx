import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { setUnauthorizedHandler } from '../api/client';
import type { AdminBookingDetail } from '../api/types';
import { clearMemorySession, setMemorySession } from '../auth/session-store';
import type { StaffRole } from '../config/permissions';
import { privilegedAccessToken } from '../test/jwt';
import { BookingDetailPage } from './BookingDetailPage';

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => mockAuth,
}));

let mockAuth: { staffRole: StaffRole | null };

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

const bookingId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const passengerId = '11111111-1111-1111-1111-111111111111';
const riderId = '33333333-3333-3333-3333-333333333333';

const sampleDetail: AdminBookingDetail = {
  id: bookingId,
  status: 'CANCELLED',
  vehicleCategory: 'OKADA',
  passengerId,
  riderId,
  serviceZoneId: '55555555-5555-5555-5555-555555555555',
  pickupLabel: 'East Legon junction',
  bookingFeePesewas: 100,
  paymentExpiresAt: null,
  searchExpiresAt: null,
  createdAt: '2026-10-01T10:00:00.000Z',
  acceptedAt: '2026-10-01T10:05:00.000Z',
  startedAt: null,
  cancelledAt: '2026-10-01T10:20:00.000Z',
  completedAt: null,
  cancellationReason: 'Changed plans',
  exactCoordinatesIncluded: false,
  passenger: {
    id: passengerId,
    phoneNumber: '+233201000010',
    displayName: 'Ama Passenger',
    status: 'ACTIVE',
  },
  rider: {
    id: riderId,
    fullName: 'Kofi Rider',
    phoneNumber: '+233201000020',
    status: 'ACTIVE',
  },
  connectionFeePayment: {
    id: '44444444-4444-4444-4444-444444444444',
    status: 'SUCCESS',
    amountPesewas: 100,
    currency: 'GHS',
    providerReference: 'bf_ok',
    createdAt: '2026-10-01T10:06:00.000Z',
  },
  destinationLabel: null,
  cancellationActorType: 'PASSENGER',
  serviceZone: {
    id: '55555555-5555-5555-5555-555555555555',
    name: 'Accra Central',
    status: 'ACTIVE',
    isActive: true,
  },
  payments: [
    {
      id: '44444444-4444-4444-4444-444444444444',
      purpose: 'BOOKING_FEE',
      status: 'SUCCESS',
      amountPesewas: 100,
      currency: 'GHS',
      providerReference: 'bf_ok',
      createdAt: '2026-10-01T10:06:00.000Z',
    },
  ],
  statusHistory: [
    {
      fromStatus: null,
      toStatus: 'SEARCHING',
      actorType: 'SYSTEM',
      createdAt: '2026-10-01T10:00:01.000Z',
    },
    {
      fromStatus: 'SEARCHING',
      toStatus: 'ACCEPTED',
      actorType: 'RIDER',
      createdAt: '2026-10-01T10:05:00.000Z',
    },
    {
      fromStatus: 'ACCEPTED',
      toStatus: 'CANCELLED',
      actorType: 'PASSENGER',
      createdAt: '2026-10-01T10:20:00.000Z',
    },
  ],
  privacy: {
    exactCoordinatesIncluded: false,
    note: 'Ordinary booking detail omits exact lat/lng.',
  },
};

function renderDetail(entry = `/bookings/${bookingId}?status=CANCELLED`) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/bookings" element={<div>directory-screen</div>} />
        <Route path="/bookings/:bookingId" element={<BookingDetailPage />} />
        <Route path="/passengers/:passengerId" element={<div>passenger-screen</div>} />
        <Route path="/riders/:riderId" element={<div>rider-screen</div>} />
        <Route path="/session-expired" element={<div>session-expired-screen</div>} />
        <Route path="/forbidden" element={<div>forbidden-screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('BookingDetailPage', () => {
  beforeEach(() => {
    clearMemorySession();
    setUnauthorizedHandler(null);
    vi.restoreAllMocks();
    mockAuth = { staffRole: 'OPERATIONS_ADMIN' };
    vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:3000/api/v1');
    setMemorySession({
      accessToken: privilegedAccessToken({ staffRole: 'OPERATIONS_ADMIN' }),
      refreshToken: 'refresh-token-value-20chars',
    });
  });

  it('loads detail, payments, timeline and privacy note without coordinates', async () => {
    const hostile = {
      ...sampleDetail,
      pickupLatitude: 5.6037,
      pickupLongitude: -0.187,
      destinationLatitude: 5.55,
      destinationLongitude: -0.2,
      ghanaCardNumber: 'GHA-123456789-0',
      accessToken: 'tok',
      statusHistory: sampleDetail.statusHistory.map((entry) => ({
        ...entry,
        actorId: 'should-not-render',
        reason: 'invented-reason-must-not-show',
      })),
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(hostile)));
    const { container } = renderDetail();

    expect(screen.getByTestId('booking-detail-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('booking-detail')).toBeInTheDocument();
    expect(screen.getByTestId('booking-breadcrumb')).toHaveTextContent('Booking directory');
    expect(screen.getByText('East Legon junction')).toBeInTheDocument();
    expect(screen.getByText('Accra Central (ACTIVE)')).toBeInTheDocument();
    expect(screen.getByText('Changed plans')).toBeInTheDocument();
    expect(screen.getByText('PASSENGER')).toBeInTheDocument();
    expect(screen.getByTestId('booking-fee-snapshot')).toBeInTheDocument();
    expect(screen.getByTestId('booking-payments-table')).toBeInTheDocument();
    expect(screen.getByTestId('booking-timeline')).toBeInTheDocument();
    expect(screen.getByText(/SEARCHING → ACCEPTED/)).toBeInTheDocument();
    expect(screen.getByTestId('booking-privacy-note')).toHaveTextContent('Coordinates included: no');
    expect(screen.getByTestId('booking-passenger-link')).toBeInTheDocument();
    expect(screen.getByTestId('booking-rider-link')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/5\.6037/);
    expect(container.textContent).not.toMatch(/-0\.187/);
    expect(container.textContent).not.toMatch(/GHA-123456789-0/);
    expect(container.textContent).not.toMatch(/invented-reason-must-not-show/);
    expect(container.textContent).not.toMatch(/should-not-render/);
    expect(container.textContent).not.toMatch(/pickupLatitude/i);
  });

  it('handles empty status history and missing rider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonOk({
          ...sampleDetail,
          rider: null,
          riderId: null,
          statusHistory: [],
          payments: [],
          connectionFeePayment: null,
        }),
      ),
    );
    renderDetail();
    expect(await screen.findByTestId('booking-timeline-empty')).toBeInTheDocument();
    expect(screen.getByTestId('booking-rider-empty')).toBeInTheDocument();
    expect(screen.getByTestId('booking-payments-empty')).toBeInTheDocument();
  });

  it('shows missing booking on 404', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(404, 'NOT_FOUND', 'Booking not found')));
    renderDetail();
    expect(await screen.findByTestId('booking-detail-error')).toHaveTextContent('Booking not found');
    expect(screen.queryByTestId('booking-detail')).not.toBeInTheDocument();
  });

  it('handles 401 via session expiry', async () => {
    setUnauthorizedHandler(() => {
      clearMemorySession();
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonErr(401, 'UNAUTHORIZED', 'Session expired')));
    renderDetail();
    expect(await screen.findByText('session-expired-screen')).toBeInTheDocument();
  });

  it('handles 403 without fabricating detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonErr(403, 'FORBIDDEN', 'No ViewBookingHistory')),
    );
    renderDetail();
    expect(await screen.findByTestId('booking-detail-error')).toHaveTextContent(
      'Permission denied',
    );
    expect(screen.queryByTestId('booking-detail')).not.toBeInTheDocument();
  });

  it('hides rider profile link for Support without ReviewRiders', async () => {
    mockAuth = { staffRole: 'SUPPORT_ADMIN' };
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(sampleDetail)));
    renderDetail();
    await screen.findByTestId('booking-detail');
    expect(screen.getByTestId('booking-passenger-link')).toBeInTheDocument();
    expect(screen.queryByTestId('booking-rider-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('booking-rider-id-only')).toHaveTextContent(riderId);
  });

  it('preserves directory query params when returning', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async () => jsonOk(sampleDetail)));
    renderDetail(`/bookings/${bookingId}?status=CANCELLED&page=2`);
    await screen.findByTestId('booking-detail');
    await user.click(screen.getByTestId('booking-back'));
    expect(await screen.findByText('directory-screen')).toBeInTheDocument();
  });
});
