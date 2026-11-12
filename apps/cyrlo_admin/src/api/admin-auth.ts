import { apiRequest } from './client';
import type {
  AdminMe,
  LogoutResult,
  MfaEnrollConfirmResult,
  MfaEnrollStartResult,
  MfaVerifyResult,
  OtpRequestResult,
  OtpVerifyResult,
} from './types';

export function requestAdminOtp(phoneNumber: string): Promise<OtpRequestResult> {
  return apiRequest<OtpRequestResult>('/admin/auth/otp', {
    auth: false,
    body: { phoneNumber },
  });
}

export function verifyAdminOtp(phoneNumber: string, code: string): Promise<OtpVerifyResult> {
  return apiRequest<OtpVerifyResult>('/admin/auth/otp/verify', {
    auth: false,
    body: { phoneNumber, code },
  });
}

export function verifyAdminMfa(input: {
  mfaToken: string;
  code?: string;
  recoveryCode?: string;
}): Promise<MfaVerifyResult> {
  return apiRequest<MfaVerifyResult>('/admin/auth/mfa/verify', {
    auth: false,
    body: input,
  });
}

export function startMfaEnrollment(enrollmentToken: string): Promise<MfaEnrollStartResult> {
  return apiRequest<MfaEnrollStartResult>('/admin/mfa/enroll/start', {
    method: 'POST',
    auth: false,
    accessToken: enrollmentToken,
  });
}

export function confirmMfaEnrollment(
  enrollmentToken: string,
  code: string,
): Promise<MfaEnrollConfirmResult> {
  return apiRequest<MfaEnrollConfirmResult>('/admin/mfa/enroll/confirm', {
    auth: false,
    accessToken: enrollmentToken,
    body: { code },
  });
}

export function fetchAdminMe(): Promise<AdminMe> {
  return apiRequest<AdminMe>('/admin/me');
}

/** Backend contract: POST /auth/logout with Bearer access + refreshToken body. */
export function logoutAdmin(refreshToken: string): Promise<LogoutResult> {
  return apiRequest<LogoutResult>('/auth/logout', {
    body: { refreshToken },
  });
}
