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
