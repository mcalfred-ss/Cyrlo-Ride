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
