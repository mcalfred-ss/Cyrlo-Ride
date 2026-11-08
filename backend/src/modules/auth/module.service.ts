import { randomUUID } from 'node:crypto';

import { canExposeDevelopmentOtp, env } from '../../config/env.js';
import { AppError } from '../../common/errors/app-error.js';
import { generateOtpCode, hashOtpCode } from '../../common/security/otp.js';
import {
  createRefreshToken,
  hashSecretValue,
  signAccessToken,
} from '../../common/security/tokens.js';
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
  sms: SmsProvider;
  now?: () => Date;
  generateCode?: () => string;
  createFamilyId?: () => string;
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

  constructor(
    private readonly repository: AuthStore,
    private readonly deps: AuthServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.generateCode = deps.generateCode ?? generateOtpCode;
    this.createFamilyId = deps.createFamilyId ?? (() => randomUUID());
  }

  async requestOtp(input: RequestOtpInput): Promise<RequestOtpResult> {
    const now = this.now();
    const code = this.generateCode();
    const codeHash = hashOtpCode(code, env.OTP_HASH_SECRET);
    const expiresAt = new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000);

    await this.repository.createOtpChallenge({
      phoneNumber: input.phoneNumber,
      codeHash,
      expiresAt,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      now,
    });

    await this.deps.sms.send({
      to: input.phoneNumber,
      body: `Your Cyrlo Ride code is ${code}. It expires in ${env.OTP_TTL_SECONDS / 60} minutes.`,
    });

    const result: RequestOtpResult = {
      expiresIn: env.OTP_TTL_SECONDS,
      resendAfter: env.OTP_RESEND_COOLDOWN_SECONDS,
    };

    if (canExposeDevelopmentOtp(env)) {
      result.developmentCode = code;
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

    const { user, created } = await this.repository.verifyOtpAndCreateSession({
      phoneNumber: input.phoneNumber,
      codeHash: hashOtpCode(input.code, env.OTP_HASH_SECRET),
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
