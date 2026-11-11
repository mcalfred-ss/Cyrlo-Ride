import { randomUUID } from 'node:crypto';

import {
  OtpPurpose,
  Prisma,
  type PrismaClient,
  type UserRole,
  type UserStatus,
} from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { canAttemptOtp, isOtpExpired } from '../../common/security/otp.js';
import { secretsMatch } from '../../common/security/tokens.js';

export interface AuthUser {
  id: string;
  phoneNumber: string;
  role: UserRole;
  status: UserStatus;
  displayName: string | null;
}

export interface IssuedRefreshSession {
  id: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

/** Private to the auth module. Do not import this from another module. */
export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findUserByPhone(phoneNumber: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
      select: {
        id: true,
        phoneNumber: true,
        role: true,
        status: true,
        displayName: true,
      },
    });
  }

  async findUserById(id: string): Promise<AuthUser | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phoneNumber: true,
        role: true,
        status: true,
        displayName: true,
      },
    });
  }

  async findOpenLoginOtp(
    phoneNumber: string,
  ): Promise<{ id: string; codeHash: string; expiresAt: Date; attempts: number; maxAttempts: number } | null> {
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: {
        phoneNumber,
        purpose: OtpPurpose.LOGIN,
        consumedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codeHash: true,
        expiresAt: true,
        attempts: true,
        maxAttempts: true,
      },
    });
    return challenge;
  }

  /**
   * Creates a new OTP challenge after enforcing resend cooldown and
   * invalidating prior open challenges for the same phone/purpose.
   */
  async createOtpChallenge(input: {
    phoneNumber: string;
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
    cooldownSeconds: number;
    now: Date;
  }): Promise<{ id: string; expiresAt: Date; createdAt: Date }> {
    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.otpChallenge.findFirst({
        where: { phoneNumber: input.phoneNumber, purpose: OtpPurpose.LOGIN },
        orderBy: { createdAt: 'desc' },
      });

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

      await tx.otpChallenge.updateMany({
        where: {
          phoneNumber: input.phoneNumber,
          purpose: OtpPurpose.LOGIN,
          consumedAt: null,
        },
        data: { consumedAt: input.now },
      });

      return tx.otpChallenge.create({
        data: {
          phoneNumber: input.phoneNumber,
          purpose: OtpPurpose.LOGIN,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          maxAttempts: input.maxAttempts,
        },
        select: { id: true, expiresAt: true, createdAt: true },
      });
    });
  }

  /**
   * Verifies OTP, creates or loads the user, and issues a refresh session.
   * Concurrent verifiers race on consuming the challenge row.
   */
  async verifyOtpAndCreateSession(input: {
    phoneNumber: string;
    codeHash: string;
    role: 'PASSENGER' | 'RIDER';
    refreshTokenHash: string;
    refreshExpiresAt: Date;
    familyId: string;
    now: Date;
  }): Promise<{ user: AuthUser; created: boolean }> {
    try {
      // Failure side-effects (attempt increment, expiry consume) must commit.
      // Never throw AppError inside the transaction after writing those rows.
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const challenge = await tx.otpChallenge.findFirst({
            where: {
              phoneNumber: input.phoneNumber,
              purpose: OtpPurpose.LOGIN,
              consumedAt: null,
            },
            orderBy: { createdAt: 'desc' },
          });

          if (!challenge) {
            return { ok: false as const, error: invalidOtpError() };
          }

          if (isOtpExpired(challenge.expiresAt, input.now)) {
            await tx.otpChallenge.update({
              where: { id: challenge.id },
              data: { consumedAt: input.now },
            });
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'OTP has expired',
              }),
            };
          }

          if (!canAttemptOtp(challenge.attempts, challenge.maxAttempts)) {
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'OTP attempts exhausted',
              }),
            };
          }

          if (!secretsMatch(challenge.codeHash, input.codeHash)) {
            const updated = await tx.otpChallenge.update({
              where: { id: challenge.id },
              data: { attempts: { increment: 1 } },
            });
            if (!canAttemptOtp(updated.attempts, updated.maxAttempts)) {
              return {
                ok: false as const,
                error: new AppError({
                  status: 401,
                  code: 'UNAUTHORIZED',
                  message: 'OTP attempts exhausted',
                }),
              };
            }
            return { ok: false as const, error: invalidOtpError() };
          }

          const consumed = await tx.otpChallenge.updateMany({
            where: {
              id: challenge.id,
              consumedAt: null,
              attempts: { lt: challenge.maxAttempts },
            },
            data: { consumedAt: input.now },
          });

          if (consumed.count !== 1) {
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'OTP has already been used',
              }),
            };
          }

          const existing = await tx.user.findUnique({
            where: { phoneNumber: input.phoneNumber },
          });

          let user: AuthUser;
          let created = false;

          if (!existing) {
            user = await tx.user.create({
              data: {
                phoneNumber: input.phoneNumber,
                role: input.role,
                status: 'ACTIVE',
                ...(input.role === 'PASSENGER'
                  ? { passengerProfile: { create: {} } }
                  : {
                      riderProfile: {
                        create: {
                          fullName: '',
                        },
                      },
                    }),
              },
              select: {
                id: true,
                phoneNumber: true,
                role: true,
                status: true,
                displayName: true,
              },
            });
            created = true;
          } else {
            if (existing.role !== input.role) {
              return {
                ok: false as const,
                error: new AppError({
                  status: 409,
                  code: 'CONFLICT',
                  message: 'Phone number is registered with a different role',
                }),
              };
            }
            if (existing.status === 'SUSPENDED') {
              return {
                ok: false as const,
                error: new AppError({
                  status: 403,
                  code: 'FORBIDDEN',
                  message: 'Account is suspended',
                }),
              };
            }
            if (existing.status === 'DELETED') {
              return {
                ok: false as const,
                error: new AppError({
                  status: 401,
                  code: 'UNAUTHORIZED',
                  message: 'Authentication is required',
                }),
              };
            }
            user = {
              id: existing.id,
              phoneNumber: existing.phoneNumber,
              role: existing.role,
              status: existing.status,
              displayName: existing.displayName,
            };
          }

          await tx.refreshToken.create({
            data: {
              userId: user.id,
              familyId: input.familyId,
              tokenHash: input.refreshTokenHash,
              expiresAt: input.refreshExpiresAt,
            },
          });

          return { ok: true as const, user, created };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (!outcome.ok) {
        throw outcome.error;
      }
      return { user: outcome.user, created: outcome.created };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'OTP verification is already in progress',
        });
      }
      throw error;
    }
  }

  async rotateRefreshSession(input: {
    presentedTokenHash: string;
    nextTokenHash: string;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<{ user: AuthUser; familyId: string }> {
    try {
      // Family revocation on reuse/suspend must commit; return errors after the TX.
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<
            Array<{
              id: string;
              user_id: string;
              family_id: string;
              token_hash: string;
              expires_at: Date;
              revoked_at: Date | null;
            }>
          >`
            SELECT id, user_id, family_id, token_hash, expires_at, revoked_at
            FROM refresh_tokens
            WHERE token_hash = ${input.presentedTokenHash}
            FOR UPDATE
          `;

          const current = rows[0];
          if (!current) {
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Refresh token is invalid',
              }),
            };
          }

          if (current.revoked_at) {
            await tx.refreshToken.updateMany({
              where: {
                familyId: current.family_id,
                revokedAt: null,
              },
              data: { revokedAt: input.now },
            });
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Refresh token reuse detected',
              }),
            };
          }

          if (current.expires_at.getTime() <= input.now.getTime()) {
            await tx.refreshToken.update({
              where: { id: current.id },
              data: { revokedAt: input.now },
            });
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Refresh token has expired',
              }),
            };
          }

          const user = await tx.user.findUnique({
            where: { id: current.user_id },
            select: {
              id: true,
              phoneNumber: true,
              role: true,
              status: true,
              displayName: true,
            },
          });

          if (!user || user.status === 'DELETED') {
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Refresh token is invalid',
              }),
            };
          }

          if (user.status === 'SUSPENDED') {
            await tx.refreshToken.updateMany({
              where: { familyId: current.family_id, revokedAt: null },
              data: { revokedAt: input.now },
            });
            return {
              ok: false as const,
              error: new AppError({
                status: 403,
                code: 'FORBIDDEN',
                message: 'Account is suspended',
              }),
            };
          }

          const revoked = await tx.refreshToken.updateMany({
            where: { id: current.id, revokedAt: null },
            data: { revokedAt: input.now },
          });

          if (revoked.count !== 1) {
            await tx.refreshToken.updateMany({
              where: { familyId: current.family_id, revokedAt: null },
              data: { revokedAt: input.now },
            });
            return {
              ok: false as const,
              error: new AppError({
                status: 401,
                code: 'UNAUTHORIZED',
                message: 'Refresh token reuse detected',
              }),
            };
          }

          await tx.refreshToken.create({
            data: {
              userId: user.id,
              familyId: current.family_id,
              tokenHash: input.nextTokenHash,
              expiresAt: input.nextExpiresAt,
            },
          });

          return { ok: true as const, user, familyId: current.family_id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      if (!outcome.ok) {
        throw outcome.error;
      }
      return { user: outcome.user, familyId: outcome.familyId };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new AppError({
          status: 409,
          code: 'CONFLICT',
          message: 'Refresh is already in progress',
        });
      }
      throw error;
    }
  }

  async revokeRefreshSession(input: {
    tokenHash: string;
    userId: string;
    now: Date;
  }): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: input.tokenHash,
        userId: input.userId,
        revokedAt: null,
      },
      data: { revokedAt: input.now },
    });
    return result.count > 0;
  }

  /** Test/helper: create a suspended user with an active refresh session. */
  async createRefreshSessionForUser(input: {
    userId: string;
    tokenHash: string;
    familyId?: string;
    expiresAt: Date;
  }): Promise<IssuedRefreshSession> {
    const created = await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        familyId: input.familyId ?? randomUUID(),
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
    return {
      id: created.id,
      familyId: created.familyId,
      tokenHash: created.tokenHash,
      expiresAt: created.expiresAt,
    };
  }
}

function invalidOtpError(): AppError {
  return new AppError({
    status: 401,
    code: 'UNAUTHORIZED',
    message: 'OTP is invalid',
  });
}
