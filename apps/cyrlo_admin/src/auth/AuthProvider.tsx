import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import * as adminAuth from '../api/admin-auth';
import { setUnauthorizedHandler } from '../api/client';
import { ApiError } from '../api/types';
import type { AdminMe } from '../api/types';
import type { StaffRole } from '../config/permissions';
import {
  clearMemorySession,
  getAccessToken,
  getRefreshToken,
  setMemorySession,
} from './session-store';
import {
  accessTokenExpiresAtMs,
  hasPrivilegedMfaAssurance,
} from './token-claims';

export type AuthPhase =
  | 'anonymous'
  | 'awaiting_otp'
  | 'mfa_required'
  | 'mfa_enrollment_required'
  | 'authenticated'
  | 'session_expired';

interface PendingMfa {
  mfaToken: string;
}

interface PendingEnrollment {
  enrollmentToken: string;
}

interface AuthContextValue {
  phase: AuthPhase;
  phoneNumber: string;
  me: AdminMe | null;
  staffRole: StaffRole | null;
  pendingMfa: PendingMfa | null;
  pendingEnrollment: PendingEnrollment | null;
  developmentCode: string | null;
  error: string | null;
  busy: boolean;
  recoveryCodes: string[] | null;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (code: string) => Promise<void>;
  verifyMfa: (input: { code?: string; recoveryCode?: string }) => Promise<void>;
  startEnrollment: () => Promise<{ otpauthUrl: string; qrCodeDataUrl: string }>;
  confirmEnrollment: (code: string) => Promise<void>;
  establishFromTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  acknowledgeSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadMeOrExpire(): Promise<AdminMe> {
  const token = getAccessToken();
  if (!hasPrivilegedMfaAssurance(token)) {
    clearMemorySession();
    throw new ApiError(401, 'MFA_REQUIRED', 'Privileged MFA session is required');
  }
  return adminAuth.fetchAdminMe();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('anonymous');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [me, setMe] = useState<AdminMe | null>(null);
  const [pendingMfa, setPendingMfa] = useState<PendingMfa | null>(null);
  const [pendingEnrollment, setPendingEnrollment] = useState<PendingEnrollment | null>(null);
  const [developmentCode, setDevelopmentCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const expiryTimer = useRef<number | null>(null);
  /** Bumped on new challenges / MFA attempts so stale async completions are ignored. */
  const authOpIdRef = useRef(0);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimer.current !== null) {
      window.clearTimeout(expiryTimer.current);
      expiryTimer.current = null;
    }
  }, []);

  const expireSession = useCallback(() => {
    clearExpiryTimer();
    clearMemorySession();
    setMe(null);
    setPendingMfa(null);
    setPendingEnrollment(null);
    setRecoveryCodes(null);
    setPhase('session_expired');
  }, [clearExpiryTimer]);

  const scheduleExpiry = useCallback(
    (accessToken: string) => {
      clearExpiryTimer();
      const expiresAt = accessTokenExpiresAtMs(accessToken);
      if (!expiresAt) return;
      const delay = Math.max(expiresAt - Date.now() - 5_000, 0);
      expiryTimer.current = window.setTimeout(() => {
        expireSession();
      }, delay);
    },
    [clearExpiryTimer, expireSession],
  );

  const establishFromTokens = useCallback(
    async (accessToken: string, refreshToken: string, opId?: number) => {
      if (!hasPrivilegedMfaAssurance(accessToken)) {
        clearMemorySession();
        throw new ApiError(401, 'MFA_REQUIRED', 'Access token lacks MFA assurance');
      }

      // C2: ignore superseded completions before mutating privileged memory.
      if (opId !== undefined && opId !== authOpIdRef.current) {
        return;
      }

      try {
        setMemorySession({ accessToken, refreshToken });
        const profile = await loadMeOrExpire();

        // C2: re-check after await — a newer op may have won meanwhile.
        if (opId !== undefined && opId !== authOpIdRef.current) {
          if (getAccessToken() === accessToken) {
            clearMemorySession();
          }
          return;
        }

        setMe(profile);
        setPendingMfa(null);
        setPendingEnrollment(null);
        setPhase('authenticated');
        scheduleExpiry(accessToken);
      } catch (err) {
        // C1: never leave provisional privileged tokens after /admin/me failure.
        // Only clear if this attempt's tokens are still the ones in memory (avoid clobbering a newer win).
        if (getAccessToken() === accessToken) {
          clearExpiryTimer();
          clearMemorySession();
          setMe(null);
        }
        throw err;
      }
    },
    [clearExpiryTimer, scheduleExpiry],
  );

  useEffect(() => {
    setUnauthorizedHandler(() => {
      expireSession();
    });
    return () => {
      setUnauthorizedHandler(null);
      clearExpiryTimer();
    };
  }, [clearExpiryTimer, expireSession]);

  const requestOtp = useCallback(async (phone: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminAuth.requestAdminOtp(phone);
      setPhoneNumber(phone);
      setDevelopmentCode(result.developmentCode ?? null);
      setPhase('awaiting_otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to request OTP');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const verifyOtp = useCallback(async (code: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminAuth.verifyAdminOtp(phoneNumber, code);
      // Invalidate any in-flight MFA/enrollment completion for a prior challenge.
      authOpIdRef.current += 1;
      if (result.status === 'MFA_REQUIRED') {
        setPendingMfa({ mfaToken: result.mfaToken });
        setPendingEnrollment(null);
        setPhase('mfa_required');
        return;
      }
      setPendingEnrollment({ enrollmentToken: result.enrollmentToken });
      setPendingMfa(null);
      setPhase('mfa_enrollment_required');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'OTP verification failed');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [phoneNumber]);

  const verifyMfa = useCallback(
    async (input: { code?: string; recoveryCode?: string }) => {
      if (!pendingMfa) {
        setError('MFA challenge is missing');
        return;
      }
      const challengeToken = pendingMfa.mfaToken;
      const opId = ++authOpIdRef.current;
      setBusy(true);
      setError(null);
      try {
        const result = await adminAuth.verifyAdminMfa({
          mfaToken: challengeToken,
          code: input.code,
          recoveryCode: input.recoveryCode,
        });
        if (opId !== authOpIdRef.current) {
          return;
        }
        await establishFromTokens(result.accessToken, result.refreshToken, opId);
      } catch (err) {
        if (opId === authOpIdRef.current) {
          setError(err instanceof ApiError ? err.message : 'MFA verification failed');
        }
        throw err;
      } finally {
        if (opId === authOpIdRef.current) {
          setBusy(false);
        }
      }
    },
    [establishFromTokens, pendingMfa],
  );

  const startEnrollment = useCallback(async () => {
    if (!pendingEnrollment) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Enrollment token is missing');
    }
    setBusy(true);
    setError(null);
    try {
      return await adminAuth.startMfaEnrollment(pendingEnrollment.enrollmentToken);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start MFA enrollment');
      throw err;
    } finally {
      setBusy(false);
    }
  }, [pendingEnrollment]);

  const confirmEnrollment = useCallback(
    async (code: string) => {
      if (!pendingEnrollment) {
        setError('Enrollment token is missing');
        return;
      }
      const enrollmentToken = pendingEnrollment.enrollmentToken;
      const opId = ++authOpIdRef.current;
      setBusy(true);
      setError(null);
      try {
        const result = await adminAuth.confirmMfaEnrollment(enrollmentToken, code);
        if (opId !== authOpIdRef.current) {
          return;
        }
        setRecoveryCodes(result.recoveryCodes);
        await establishFromTokens(result.accessToken, result.refreshToken, opId);
      } catch (err) {
        if (opId === authOpIdRef.current) {
          setError(err instanceof ApiError ? err.message : 'MFA enrollment failed');
        }
        throw err;
      } finally {
        if (opId === authOpIdRef.current) {
          setBusy(false);
        }
      }
    },
    [establishFromTokens, pendingEnrollment],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    setError(null);
    authOpIdRef.current += 1;
    const refreshToken = getRefreshToken();
    const accessOk = hasPrivilegedMfaAssurance(getAccessToken());
    try {
      if (refreshToken && accessOk) {
        await adminAuth.logoutAdmin(refreshToken);
      }
    } catch {
      // Always clear local privileged state.
    } finally {
      clearExpiryTimer();
      clearMemorySession();
      setMe(null);
      setPendingMfa(null);
      setPendingEnrollment(null);
      setRecoveryCodes(null);
      setPhoneNumber('');
      setDevelopmentCode(null);
      setPhase('anonymous');
      setBusy(false);
    }
  }, [clearExpiryTimer]);

  const value = useMemo<AuthContextValue>(
    () => ({
      phase,
      phoneNumber,
      me,
      staffRole: me?.staffRole ?? null,
      pendingMfa,
      pendingEnrollment,
      developmentCode,
      error,
      busy,
      recoveryCodes,
      requestOtp,
      verifyOtp,
      verifyMfa,
      startEnrollment,
      confirmEnrollment,
      establishFromTokens: (accessToken, refreshToken) =>
        establishFromTokens(accessToken, refreshToken),
      logout,
      clearError: () => setError(null),
      acknowledgeSessionExpired: () => {
        setPhase('anonymous');
        setPhoneNumber('');
        setError(null);
        setDevelopmentCode(null);
      },
    }),
    [
      phase,
      phoneNumber,
      me,
      pendingMfa,
      pendingEnrollment,
      developmentCode,
      error,
      busy,
      recoveryCodes,
      requestOtp,
      verifyOtp,
      verifyMfa,
      startEnrollment,
      confirmEnrollment,
      establishFromTokens,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
