import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { canAttemptOtp, isOtpExpired } from '../../common/security/otp.js';
import { secretsMatch } from '../../common/security/tokens.js';
import type { AuthStore, AuthUser, IssuedRefreshSession } from './auth-store.js';

interface OtpRow {
  id: string;
  phoneNumber: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

interface RefreshRow {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

/** In-memory AuthStore for unit tests. Mirrors Prisma auth semantics. */
export class MemoryAuthStore implements AuthStore {
  users = new Map<string, AuthUser>();
  usersByPhone = new Map<string, string>();
  otpChallenges: OtpRow[] = [];
  refreshTokens: RefreshRow[] = [];
  /** Test hook: awaited after the OTP verify lock is acquired. */
  onEnterVerify?: () => Promise<void>;
  /** Test hook: awaited after the refresh lock is acquired. */
  onEnterRefresh?: () => Promise<void>;
  private otpLocks = new Set<string>();
  private refreshLocks = new Set<string>();

  async findUserByPhone(phoneNumber: string): Promise<AuthUser | null> {
    const id = this.usersByPhone.get(phoneNumber);
    return id ? structuredClone(this.users.get(id)!) : null;
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    const user = this.users.get(id);
    return user ? structuredClone(user) : null;
  }

  async findOpenLoginOtp(
    phoneNumber: string,
  ): Promise<{ id: string; codeHash: string; expiresAt: Date; attempts: number; maxAttempts: number } | null> {
    const challenge = [...this.otpChallenges]
      .filter((row) => row.phoneNumber === phoneNumber && row.consumedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!challenge) return null;
    return {
      id: challenge.id,
      codeHash: challenge.codeHash,
      expiresAt: challenge.expiresAt,
      attempts: challenge.attempts,
      maxAttempts: challenge.maxAttempts,
    };
  }

  async createOtpChallenge(input: {
    phoneNumber: string;
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
    cooldownSeconds: number;
    now: Date;
  }): Promise<{ id: string; expiresAt: Date; createdAt: Date }> {
    const latest = [...this.otpChallenges]
      .filter((row) => row.phoneNumber === input.phoneNumber)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (latest) {
      const elapsedMs = input.now.getTime() - latest.createdAt.getTime();
      if (elapsedMs < input.cooldownSeconds * 1000) {
        throw new AppError({
          status: 429,
          code: 'RATE_LIMITED',
          message: 'Please wait before requesting another code',
          details: {
            resendAfter: Math.ceil((input.cooldownSeconds * 1000 - elapsedMs) / 1000),
          },
        });
      }
    }

    for (const row of this.otpChallenges) {
      if (row.phoneNumber === input.phoneNumber && row.consumedAt === null) {
        row.consumedAt = input.now;
      }
    }

    const created: OtpRow = {
      id: randomUUID(),
      phoneNumber: input.phoneNumber,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      consumedAt: null,
      createdAt: input.now,
    };
    this.otpChallenges.push(created);
    return { id: created.id, expiresAt: created.expiresAt, createdAt: created.createdAt };
  }

  async verifyOtpAndCreateSession(input: {
    phoneNumber: string;
    codeHash: string;
    role: 'PASSENGER' | 'RIDER';
    refreshTokenHash: string;
    refreshExpiresAt: Date;
    familyId: string;
    now: Date;
  }): Promise<{ user: AuthUser; created: boolean }> {
    if (this.otpLocks.has(input.phoneNumber)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'OTP verification is already in progress',
      });
    }
    this.otpLocks.add(input.phoneNumber);
    try {
      if (this.onEnterVerify) await this.onEnterVerify();
      const challenge = [...this.otpChallenges]
        .filter((row) => row.phoneNumber === input.phoneNumber && row.consumedAt === null)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      if (!challenge) throw invalidOtpError();

      if (isOtpExpired(challenge.expiresAt, input.now)) {
        challenge.consumedAt = input.now;
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'OTP has expired',
        });
      }

      if (!canAttemptOtp(challenge.attempts, challenge.maxAttempts)) {
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'OTP attempts exhausted',
        });
      }

      if (!secretsMatch(challenge.codeHash, input.codeHash)) {
        challenge.attempts += 1;
        if (!canAttemptOtp(challenge.attempts, challenge.maxAttempts)) {
          throw new AppError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'OTP attempts exhausted',
          });
        }
        throw invalidOtpError();
      }

      if (challenge.consumedAt !== null) {
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'OTP has already been used',
        });
      }
      challenge.consumedAt = input.now;

      let user = await this.findUserByPhone(input.phoneNumber);
      let created = false;

      if (!user) {
        user = {
          id: randomUUID(),
          phoneNumber: input.phoneNumber,
          role: input.role,
          status: 'ACTIVE',
          displayName: null,
        };
        this.users.set(user.id, user);
        this.usersByPhone.set(user.phoneNumber, user.id);
        created = true;
      } else {
        if (user.role !== input.role) {
          throw new AppError({
            status: 409,
            code: 'CONFLICT',
            message: 'Phone number is registered with a different role',
          });
        }
        if (user.status === 'SUSPENDED') {
          throw new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Account is suspended',
          });
        }
        if (user.status === 'DELETED') {
          throw new AppError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
          });
        }
      }

      this.refreshTokens.push({
        id: randomUUID(),
        userId: user.id,
        familyId: input.familyId,
        tokenHash: input.refreshTokenHash,
        expiresAt: input.refreshExpiresAt,
        revokedAt: null,
        createdAt: input.now,
      });

      return { user: structuredClone(user), created };
    } finally {
      this.otpLocks.delete(input.phoneNumber);
    }
  }

  async rotateRefreshSession(input: {
    presentedTokenHash: string;
    nextTokenHash: string;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<{ user: AuthUser; familyId: string }> {
    if (this.refreshLocks.has(input.presentedTokenHash)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Refresh is already in progress',
      });
    }
    this.refreshLocks.add(input.presentedTokenHash);

    try {
      if (this.onEnterRefresh) await this.onEnterRefresh();
      const current = this.refreshTokens.find((row) => row.tokenHash === input.presentedTokenHash);
      if (!current) {
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Refresh token is invalid',
        });
      }

      if (current.revokedAt) {
        for (const row of this.refreshTokens) {
          if (row.familyId === current.familyId && row.revokedAt === null) {
            row.revokedAt = input.now;
          }
        }
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Refresh token reuse detected',
        });
      }

      if (current.expiresAt.getTime() <= input.now.getTime()) {
        current.revokedAt = input.now;
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Refresh token has expired',
        });
      }

      const user = this.users.get(current.userId);
      if (!user || user.status === 'DELETED') {
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Refresh token is invalid',
        });
      }

      if (user.status === 'SUSPENDED') {
        for (const row of this.refreshTokens) {
          if (row.familyId === current.familyId && row.revokedAt === null) {
            row.revokedAt = input.now;
          }
        }
        throw new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Account is suspended',
        });
      }

      if (current.revokedAt !== null) {
        for (const row of this.refreshTokens) {
          if (row.familyId === current.familyId && row.revokedAt === null) {
            row.revokedAt = input.now;
          }
        }
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Refresh token reuse detected',
        });
      }

      current.revokedAt = input.now;
      this.refreshTokens.push({
        id: randomUUID(),
        userId: user.id,
        familyId: current.familyId,
        tokenHash: input.nextTokenHash,
        expiresAt: input.nextExpiresAt,
        revokedAt: null,
        createdAt: input.now,
      });

      return { user: structuredClone(user), familyId: current.familyId };
    } finally {
      this.refreshLocks.delete(input.presentedTokenHash);
    }
  }

  async revokeRefreshSession(input: {
    tokenHash: string;
    userId: string;
    now: Date;
  }): Promise<boolean> {
    const row = this.refreshTokens.find(
      (token) =>
        token.tokenHash === input.tokenHash &&
        token.userId === input.userId &&
        token.revokedAt === null,
    );
    if (!row) return false;
    row.revokedAt = input.now;
    return true;
  }

  async createRefreshSessionForUser(input: {
    userId: string;
    tokenHash: string;
    familyId?: string;
    expiresAt: Date;
  }): Promise<IssuedRefreshSession> {
    const created: RefreshRow = {
      id: randomUUID(),
      userId: input.userId,
      familyId: input.familyId ?? randomUUID(),
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: null,
      createdAt: new Date(),
    };
    this.refreshTokens.push(created);
    return {
      id: created.id,
      familyId: created.familyId,
      tokenHash: created.tokenHash,
      expiresAt: created.expiresAt,
    };
  }

  seedUser(user: AuthUser): void {
    this.users.set(user.id, user);
    this.usersByPhone.set(user.phoneNumber, user.id);
  }

  isOtpLocked(phoneNumber: string): boolean {
    return this.otpLocks.has(phoneNumber);
  }

  isRefreshLocked(tokenHash: string): boolean {
    return this.refreshLocks.has(tokenHash);
  }
}

function invalidOtpError(): AppError {
  return new AppError({
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'OTP is invalid',
  });
}
