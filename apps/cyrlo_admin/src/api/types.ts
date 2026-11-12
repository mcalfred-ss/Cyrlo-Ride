import type { StaffRole } from '../config/permissions';

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface OtpRequestResult {
  expiresIn: number;
  resendAfter: number;
  developmentCode?: string;
}

export type OtpVerifyResult =
  | { status: 'MFA_REQUIRED'; mfaToken: string; expiresIn: number }
  | { status: 'MFA_ENROLLMENT_REQUIRED'; enrollmentToken: string; expiresIn: number };

export interface StaffSessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  staffRole?: StaffRole;
}

export interface MfaVerifyResult extends StaffSessionTokens {
  staffRole: StaffRole;
}

export interface MfaEnrollStartResult {
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface MfaEnrollConfirmResult extends StaffSessionTokens {
  recoveryCodes: string[];
}

export interface AdminMe {
  id: string;
  phoneNumber: string;
  role: 'ADMIN';
  status: string;
  displayName: string | null;
  staffRole: StaffRole;
  mfaEnabled: boolean;
}

export interface LogoutResult {
  revoked: boolean;
}

/** Count + pesewas amount for BOOKING_FEE payment buckets. */
export interface FeeAmountBucket {
  count: number;
  amountPesewas: number;
}

export interface RefundStatusBucket {
  count: number;
  amountPesewas: number;
}

/**
 * Exact `GET /admin/analytics` data payload (Phase 0 console).
 * Snapshot ignores date filters; period uses inclusive UTC createdAt.
 */
export interface AdminAnalytics {
  generatedAt: string;
  dateRange: {
    from: string | null;
    to: string | null;
    timezone: string;
    boundInclusivity: string;
    field: string;
    interpretation: string;
  };
  snapshot: {
    passengers: { total: number; active: number; suspended: number };
    riders: {
      registered: number;
      availableApprox: number;
      pendingApplications: number;
    };
  };
  period: {
    bookings: {
      byStatus: Record<string, number>;
      completedConnections: number;
    };
    connectionFees: {
      unitPesewas: number;
      currency: 'GHS';
      collected: FeeAmountBucket;
      pending: FeeAmountBucket;
      failed: FeeAmountBucket;
    };
    refunds: {
      byStatus: Record<string, RefundStatusBucket>;
    };
    tokens: {
      purchases: { count: number; amountPesewas: number; currency: 'GHS' };
      usage: { deductionCount: number; tokensDeducted: number };
    };
  };
  exclusions: {
    transportationFareRevenue: boolean;
    note: string;
    abandonedBookingFeePayments: string;
  };
}

export interface AnalyticsQuery {
  from?: string;
  to?: string;
}

export type UserAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type RiderVerificationStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type RiderAvailabilityStatus = 'OFFLINE' | 'AVAILABLE' | 'BUSY';
export type AdminUserRole = 'PASSENGER' | 'RIDER' | 'ADMIN';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
}

/** Exact list item from `GET /admin/riders`. */
export interface AdminRiderListItem {
  id: string;
  phoneNumber: string;
  role: AdminUserRole;
  status: UserAccountStatus;
  displayName: string | null;
  fullName: string;
  verificationStatus: RiderVerificationStatus;
  availability: RiderAvailabilityStatus;
  submittedAt: string | null;
  createdAt: string;
}

export interface AdminRiderListResponse {
  items: AdminRiderListItem[];
  pagination: PaginationMeta;
  semantics: {
    availability: string;
    note: string;
  };
}

export interface AdminRidersQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: UserAccountStatus;
  verificationStatus?: RiderVerificationStatus;
  availability?: RiderAvailabilityStatus;
}

/** Exact profile from `GET /admin/riders/:riderId`. */
export interface AdminRiderProfile {
  id: string;
  phoneNumber: string;
  role: AdminUserRole;
  status: UserAccountStatus;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  profile: {
    fullName: string;
    verificationStatus: RiderVerificationStatus;
    availability: RiderAvailabilityStatus;
    submittedAt: string | null;
    driversLicenceNumber: string | null;
    driversLicenceExpiry: string | null;
    verificationNotes: string | null;
  };
  vehicles: Array<{
    id: string;
    category: string;
    registrationNumber: string;
    make: string;
    model: string;
    colour: string;
    capacity: number;
    verificationStatus: string;
    rejectionReason: string | null;
    submittedAt: string | null;
    reviewedAt: string | null;
  }>;
  gps: {
    sharingEnabled: boolean;
    recordedAt: string;
    receivedAt: string;
    fresh: boolean;
    maxAgeMs: number;
    snapshot: true;
  } | null;
  tokens: {
    balance: number;
    note: string;
  };
  privacy: {
    exactCoordinatesIncluded: boolean;
    note: string;
  };
  semantics: {
    accountStatus: string;
    verificationStatus: string;
    availability: string;
    gps: string;
    tokens: string;
  };
}

/** `GET /admin/riders/applications` list row (`listPendingForOps`). */
export interface AdminPendingApplicationItem {
  riderId: string;
  fullName: string;
  phoneNumber: string;
  status: UserAccountStatus;
  verificationStatus: RiderVerificationStatus;
  submittedAt: string | null;
  vehicleCount: number;
}

export type AdminPendingApplicationsResponse = AdminPendingApplicationItem[];

export type AdminReviewDecision = 'APPROVED' | 'REJECTED';

/**
 * Body for `POST .../applications/:riderId/review` and `POST .../vehicles/:vehicleId/review`.
 * Live riders-module schema (`reviewRiderSchema`) — not the unused admin legacy schema.
 * Reject requires reason length ≥ 5 (enforced by backend).
 */
export interface AdminReviewDecisionInput {
  decision: AdminReviewDecision;
  reason?: string;
}

/** Document metadata on `GET /admin/riders/applications/:riderId`. */
export interface AdminApplicationDocument {
  id: string;
  kind: string;
  vehicleId: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface AdminApplicationVehicle {
  id: string;
  category: string;
  registrationNumber: string;
  make: string;
  model: string;
  colour: string;
  capacity: number;
  verificationStatus: string;
  rejectionReason: string | null;
}

export interface AdminApplicationReviewHistoryItem {
  id: string;
  decision: AdminReviewDecision;
  reason: string | null;
  vehicleId: string | null;
  createdAt: string;
  actorId: string;
}

/** Exact application detail / review result from ops application endpoints. */
export interface AdminRiderApplication {
  riderId: string;
  fullName: string;
  verificationStatus: RiderVerificationStatus;
  driversLicenceNumber: string | null;
  driversLicenceExpiry: string | null;
  submittedAt: string | null;
  hasEncryptedGhanaCard: boolean;
  ghanaCardNumber: null;
  documents: AdminApplicationDocument[];
  vehicles: AdminApplicationVehicle[];
  reviewHistory: AdminApplicationReviewHistoryItem[];
}

/** `POST /admin/riders/vehicles/:vehicleId/review` response (`publicVehicleView`). */
export interface AdminVehicleReviewResult {
  id: string;
  category: string;
  registrationNumber: string;
  make: string;
  model: string;
  colour: string;
  capacity: number;
  verificationStatus: string;
  rejectionReason: string | null;
}

/** `POST /admin/users/suspend` body. */
export interface AdminSuspendUserInput {
  userId: string;
  reason: string;
}

/** `POST /admin/users/reinstate` body (same shape as suspend). */
export interface AdminReinstateUserInput {
  userId: string;
  reason: string;
}

export interface AdminSuspendUserResult {
  userId: string;
  status: 'SUSPENDED';
  activeTripsPreserved: number;
  sessionsRevoked: number;
}

export interface AdminReinstateUserResult {
  userId: string;
  status: 'ACTIVE';
}

/** Exact list item from `GET /admin/passengers`. */
export interface AdminPassengerListItem {
  id: string;
  phoneNumber: string;
  status: UserAccountStatus;
  displayName: string | null;
  fullName: string | null;
  createdAt: string;
}

export interface AdminPassengerListResponse {
  items: AdminPassengerListItem[];
  pagination: PaginationMeta;
}

export interface AdminPassengersQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: UserAccountStatus;
}

/** Exact profile from `GET /admin/passengers/:passengerId`. */
export interface AdminPassengerProfile {
  id: string;
  phoneNumber: string;
  status: UserAccountStatus;
  displayName: string | null;
  createdAt: string;
  updatedAt: string;
  profile: {
    fullName: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    homeLocation: string | null;
  } | null;
}

export interface AdminPassengerBookingsQuery {
  page?: number;
  pageSize?: number;
}

/** Exact booking history item from `GET /admin/passengers/:passengerId/bookings`. */
export interface AdminPassengerBookingItem {
  id: string;
  status: string;
  vehicleCategory: string;
  bookingFeePesewas: number;
  pickupLabel: string | null;
  riderId: string | null;
  createdAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
  exactCoordinatesIncluded: false;
}

export interface AdminPassengerBookingsResponse {
  items: AdminPassengerBookingItem[];
  pagination: PaginationMeta;
  privacy: {
    exactCoordinatesIncluded: false;
    note: string;
  };
}

export interface AdminPassengerCancellationsQuery {
  page?: number;
  pageSize?: number;
}

/** Exact cancellation history item from `GET /admin/passengers/:passengerId/cancellations`. */
export interface AdminPassengerCancellationItem {
  id: string;
  bookingId: string;
  reason: string;
  status: string;
  recommendation: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminPassengerCancellationsResponse {
  items: AdminPassengerCancellationItem[];
  pagination: PaginationMeta;
}

/** Booking statuses accepted by `GET /admin/bookings` filters. */
export type AdminBookingStatus =
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'SEARCHING'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface AdminBookingPartySummary {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  status: string;
}

export interface AdminBookingRiderSummary {
  id: string;
  fullName: string;
  phoneNumber: string;
  status: string;
}

export interface AdminBookingFeePaymentSnapshot {
  id: string;
  status: string;
  amountPesewas: number;
  currency: string;
  providerReference: string | null;
  createdAt: string;
}

/** Exact list item from `GET /admin/bookings`. */
export interface AdminBookingListItem {
  id: string;
  status: AdminBookingStatus | string;
  vehicleCategory: string;
  passengerId: string;
  riderId: string | null;
  serviceZoneId: string | null;
  pickupLabel: string | null;
  bookingFeePesewas: number;
  paymentExpiresAt: string | null;
  searchExpiresAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  cancelledAt: string | null;
  completedAt: string | null;
  cancellationReason: string | null;
  exactCoordinatesIncluded: false;
  passenger: AdminBookingPartySummary;
  rider: AdminBookingRiderSummary | null;
  connectionFeePayment: AdminBookingFeePaymentSnapshot | null;
}

export interface AdminBookingListResponse {
  items: AdminBookingListItem[];
  pagination: PaginationMeta;
  privacy: {
    exactCoordinatesIncluded: false;
    note: string;
  };
}

export interface AdminBookingsQuery {
  page?: number;
  pageSize?: number;
  status?: AdminBookingStatus;
  passengerId?: string;
  riderId?: string;
  serviceZoneId?: string;
  from?: string;
  to?: string;
}

export interface AdminBookingPaymentRecord {
  id: string;
  purpose: string;
  status: string;
  amountPesewas: number;
  currency: string;
  providerReference: string | null;
  createdAt: string;
}

export interface AdminBookingStatusHistoryEntry {
  fromStatus: string | null;
  toStatus: string;
  actorType: string;
  createdAt: string;
}

/** Exact detail from `GET /admin/bookings/:bookingId`. */
export interface AdminBookingDetail extends AdminBookingListItem {
  destinationLabel: string | null;
  cancellationActorType: string | null;
  serviceZone: {
    id: string;
    name: string;
    status: string;
    isActive: boolean;
  } | null;
  payments: AdminBookingPaymentRecord[];
  statusHistory: AdminBookingStatusHistoryEntry[];
  privacy: {
    exactCoordinatesIncluded: false;
    note: string;
  };
}
