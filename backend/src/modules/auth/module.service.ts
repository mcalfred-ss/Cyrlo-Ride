import { randomUUID } from 'node:crypto';

import { canExposeDevelopmentOtp, env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { generateOtpCode, hashOtpCode } from '../../common/security/otp.js';
import { staticOtpForPhone } from '../../common/security/static-otp.js';
import {
  createRefreshToken,
  hashSecretValue,
  secretsMatch,
  signAccessToken,
} from '../../common/security/tokens.js';
import {
  REMOTE_OTP_PLACEHOLDER,
  type PhoneOtpProvider,
} from '../../infrastructure/otp/phone-otp.provider.js';
import type { SmsProvider } from '../../infrastructure/sms/sms.provider.js';
import type {
  LogoutInput,
  LookupAccountInput,
  RefreshSessionInput,
  RequestOtpInput,
  VerifyOtpInput,
} from './module.schema.js';
import type { AuthStore, AuthUser } from './auth-store.js';

export interface AuthSessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUserView {
  id: string;
  phoneNumber: string;
  role: AuthUser['role'];
  status: AuthUser['status'];
  displayName: string | null;
}

export interface RequestOtpResult {
  expiresIn: number;
  resendAfter: number;
  developmentCode?: string;
}

export interface VerifyOtpResult extends AuthSessionTokens {
  user: AuthUserView;
  /** False when this phone already had a Ride account. */
  isNewUser: boolean;
}

export interface LookupAccountResult {
  registered: boolean;
  role: AuthUser['role'] | null;
}

export interface AuthServiceDeps {
  /**
   * Phone OTP delivery. Prefer Vynfy OTP API when SMS_PROVIDER=vynfy;
   * otherwise local code + SMS.
   */
  phoneOtp: PhoneOtpProvider;
  /**
   * @deprecated Kept for older call sites/tests that still inject `sms`.
   * Prefer `phoneOtp`. Ignored when `phoneOtp` is provided.
   */
  sms?: SmsProvider;
  now?: () => Date;
  generateCode?: () => string;
  createFamilyId?: () => string;
  /** Override for tests; defaults to OTP_STATIC_LOGINS allowlist. */
  staticOtpFor?: (phoneNumber: string) => string | null;
}

export interface AuthService {
  requestOtp(input: RequestOtpInput): Promise<RequestOtpResult>;
  lookupAccount(input: LookupAccountInput): Promise<LookupAccountResult>;
  verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult>;
  refresh(input: RefreshSessionInput): Promise<AuthSessionTokens>;
  logout(input: LogoutInput, userId: string): Promise<{ revoked: boolean }>;
}

export class AuthServiceImpl implements AuthService {
  private readonly now: () => Date;
  private readonly generateCode: () => string;
  private readonly createFamilyId: () => string;
  private readonly staticOtpFor: (phoneNumber: string) => string | null;
  private readonly phoneOtp: PhoneOtpProvider;

  constructor(
    private readonly repository: AuthStore,
    private readonly deps: AuthServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.generateCode = deps.generateCode ?? generateOtpCode;
    this.createFamilyId = deps.createFamilyId ?? (() => randomUUID());
    this.staticOtpFor =
      deps.staticOtpFor ??
      ((phoneNumber) => staticOtpForPhone(phoneNumber, env.OTP_STATIC_LOGINS));
    if (!deps.phoneOtp) {
      throw new AppError({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'AuthService requires phoneOtp',
      });
    }
    this.phoneOtp = deps.phoneOtp;
  }

  async requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    const now = this.now();
    const staticCode = this.staticOtpFor(input.phoneNumber);
    const expiryMinutes = Math.max(1, Math.round(env.OTP_TTL_SECONDS / 60));
    const expiresAt = new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000);

    // Store-review / QA allowlist: fixed code, no vendor delivery.
    if (staticCode) {
      await this.repository.createOtpChallenge({
        phoneNumber: input.phoneNumber,
        codeHash: hashOtpCode(staticCode, env.OTP_HASH_SECRET),
        expiresAt,
        maxAttempts: env.OTP_MAX_ATTEMPTS,
        cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
        now,
      });
      return {
        expiresIn: env.OTP_TTL_SECONDS,
        resendAfter: env.OTP_RESEND_COOLDOWN_SECONDS,
      };
    }

    const isRemoteProvider = typeof this.phoneOtp.verifyRemote === 'function';
    const localCode = isRemoteProvider ? undefined : this.generateCode();
    // Vynfy OTP verify allows max 3 attempts; keep local lock aligned.
    const maxAttempts = isRemoteProvider
      ? Math.min(env.OTP_MAX_ATTEMPTS, 3)
      : env.OTP_MAX_ATTEMPTS;
    const codeForHash = isRemoteProvider ? REMOTE_OTP_PLACEHOLDER : localCode!;

    // Enforce cooldown / invalidate prior challenges before calling the vendor.
    await this.repository.createOtpChallenge({
      phoneNumber: input.phoneNumber,
      codeHash: hashOtpCode(codeForHash, env.OTP_HASH_SECRET),
      expiresAt,
      maxAttempts,
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      now,
    });

    const delivery = await this.phoneOtp.request({
      phoneNumber: input.phoneNumber,
      localCode,
      expiryMinutes,
      length: 6,
    });

    const result: RequestOtpResult = {
      expiresIn: env.OTP_TTL_SECONDS,
      resendAfter: env.OTP_RESEND_COOLDOWN_SECONDS,
    };

    // Never expose a "development code" for remote OTP — we do not know it.
    if (delivery.mode === 'local' && canExposeDevelopmentOtp(env)) {
      result.developmentCode = delivery.code;
    }

    return result;
  }

  async lookupAccount(input: LookupAccountInput): Promise<LookupAccountResult> {
    const user = await this.repository.findUserByPhone(input.phoneNumber);
    if (!user || user.status === 'DELETED') {
      return { registered: false, role: null };
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is suspended',
      });
    }
    return { registered: true, role: user.role };
  }

  async verifyOtp(input: VerifyOtpInput): Promise<VerifyOtpResult> {
    const now = this.now();
    const refreshToken = createRefreshToken();
    const familyId = this.createFamilyId();
    const refreshTokenHash = hashSecretValue(refreshToken, env.JWT_REFRESH_SECRET);
    const refreshExpiresAt = new Date(now.getTime() + env.JWT_REFRESH_TTL_SECONDS * 1000);

    const remoteMarkerHash = hashOtpCode(REMOTE_OTP_PLACEHOLDER, env.OTP_HASH_SECRET);
    const open = await this.repository.findOpenLoginOtp(input.phoneNumber);
    const isRemoteChallenge =
      open !== null &&
      secretsMatch(open.codeHash, remoteMarkerHash) &&
      typeof this.phoneOtp.verifyRemote === 'function';

    let codeHash = hashOtpCode(input.code, env.OTP_HASH_SECRET);

    if (isRemoteChallenge) {
      try {
        await this.phoneOtp.verifyRemote!({
          phoneNumber: input.phoneNumber,
          code: input.code,
        });
        // Challenge row stores the remote marker hash; consume with that proof.
        codeHash = remoteMarkerHash;
      } catch (error) {
        // Bump local attempt counter, then surface the provider/local error.
        try {
          await this.repository.verifyOtpAndCreateSession({
            phoneNumber: input.phoneNumber,
            codeHash: hashOtpCode(`invalid:${randomUUID()}`, env.OTP_HASH_SECRET),
            role: input.role,
            refreshTokenHash,
            refreshExpiresAt,
            familyId,
            now,
          });
        } catch (localError) {
          if (
            localError instanceof AppError &&
            (localError.message === 'OTP attempts exhausted' ||
              localError.message === 'OTP has expired')
          ) {
            throw localError;
          }
        }
        throw error;
      }
    }

    const { user, created } = await this.repository.verifyOtpAndCreateSession({
      phoneNumber: input.phoneNumber,
      codeHash,
      role: input.role,
      refreshTokenHash,
      refreshExpiresAt,
      familyId,
      now,
    });

    return {
      ...this.issueAccess(user),
      refreshToken,
      user: toUserView(user),
      isNewUser: created,
    };
  }

  async refresh(input: RefreshSessionInput): Promise<AuthSessionTokens> {
    const now = this.now();
    const presentedHash = hashSecretValue(input.refreshToken, env.JWT_REFRESH_SECRET);
    const nextRefreshToken = createRefreshToken();
    const nextHash = hashSecretValue(nextRefreshToken, env.JWT_REFRESH_SECRET);
    const nextExpiresAt = new Date(now.getTime() + env.JWT_REFRESH_TTL_SECONDS * 1000);

    const { user } = await this.repository.rotateRefreshSession({
      presentedTokenHash: presentedHash,
      nextTokenHash: nextHash,
      nextExpiresAt,
      now,
    });

    return {
      ...this.issueAccess(user),
      refreshToken: nextRefreshToken,
    };
  }

  async logout(input: LogoutInput, userId: string): Promise<{ revoked: boolean }> {
    if (!userId) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }

    const revoked = await this.repository.revokeRefreshSession({
      tokenHash: hashSecretValue(input.refreshToken, env.JWT_REFRESH_SECRET),
      userId,
      now: this.now(),
    });

    return { revoked };
  }

  private issueAccess(user: AuthUser): Omit<AuthSessionTokens, 'refreshToken'> {
    return {
      accessToken: signAccessToken(
        { sub: user.id, role: user.role },
        env.JWT_ACCESS_SECRET,
        env.JWT_ACCESS_TTL_SECONDS,
        { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE },
      ),
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    };
  }
}

function toUserView(user: AuthUser): AuthUserView {
  return {
    id: user.id,
    phoneNumber: user.phoneNumber,
    role: user.role,
    status: user.status,
    displayName: user.displayName,
  };
}
