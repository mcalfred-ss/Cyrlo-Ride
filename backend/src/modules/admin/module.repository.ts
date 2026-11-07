import { OtpPurpose, type PrismaClient, type StaffRole } from '@prisma/client';

import { AppError } from '../../common/errors/app-error.js';
import { canAttemptOtp, isOtpExpired } from '../../common/security/otp.js';
import { secretsMatch } from '../../common/security/tokens.js';
import type { AdminStore } from './admin-store.js';

/** Private to the admin module. Do not import this from another module. */
export class AdminRepository implements AdminStore {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async getBootstrapState() {
    const row = await this.prisma.adminBootstrapState.upsert({
      where: { id: 1 },
      create: { id: 1 },
      update: {},
      select: { completedAt: true, completedBy: true },
    });
    return row;
  }

  async completeBootstrap(userId: string, now: Date): Promise<void> {
    const updated = await this.prisma.adminBootstrapState.updateMany({
      where: { id: 1, completedAt: null },
      data: { completedAt: now, completedBy: userId },
    });
    if (updated.count !== 1) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Administrator bootstrap is already completed',
      });
    }
  }

  async findUserByPhone(phoneNumber: string) {
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

  async findUserById(id: string) {
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

  async createAdminUser(input: { phoneNumber: string; displayName?: string | null }) {
    return this.prisma.user.create({
      data: {
        phoneNumber: input.phoneNumber,
        role: 'ADMIN',
        status: 'ACTIVE',
        displayName: input.displayName ?? null,
      },
      select: {
        id: true,
        phoneNumber: true,
        role: true,
        status: true,
        displayName: true,
      },
    });
  }

  async findActiveGrant(userId: string) {
    return this.prisma.adminRoleGrant.findFirst({
      where: { userId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async countActiveSuperAdmins() {
    return this.prisma.adminRoleGrant.count({
      where: { staffRole: 'SUPER_ADMIN', revokedAt: null },
    });
  }

  async createGrant(input: {
    userId: string;
    staffRole: StaffRole;
    grantedBy: string | null;
    now: Date;
  }) {
    if (
      input.staffRole === 'SUPER_ADMIN' &&
      input.grantedBy &&
      input.grantedBy === input.userId
    ) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Administrators cannot grant SUPER_ADMIN to themselves',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.adminRoleGrant.updateMany({
        where: { userId: input.userId, revokedAt: null },
        data: { revokedAt: input.now },
      });
      return tx.adminRoleGrant.create({
        data: {
          userId: input.userId,
          staffRole: input.staffRole,
          grantedBy: input.grantedBy,
          grantedAt: input.now,
        },
      });
    });
  }

  async revokeActiveGrants(userId: string, now: Date) {
    const result = await this.prisma.adminRoleGrant.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count;
  }

  async createInvitation(input: {
    phoneNumber: string;
    staffRole: StaffRole;
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
    now: Date;
  }) {
    return this.prisma.adminInvitation.create({
      data: {
        phoneNumber: input.phoneNumber,
        staffRole: input.staffRole,
        tokenHash: input.tokenHash,
        invitedById: input.invitedById,
        expiresAt: input.expiresAt,
        createdAt: input.now,
      },
    });
  }

  async findInvitationByTokenHash(tokenHash: string) {
    return this.prisma.adminInvitation.findUnique({ where: { tokenHash } });
  }

  async acceptInvitation(id: string, now: Date) {
    const result = await this.prisma.adminInvitation.updateMany({
      where: { id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: now },
    });
    return result.count === 1;
  }

  async getMfa(userId: string) {
    return this.prisma.adminMfaCredential.findUnique({ where: { userId } });
  }

  async upsertMfaSecret(input: {
    userId: string;
    encryptedTotpSecret: string;
    now: Date;
  }) {
    await this.prisma.adminMfaCredential.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        encryptedTotpSecret: input.encryptedTotpSecret,
        enabledAt: null,
        lastUsedStep: null,
      },
      update: {
        encryptedTotpSecret: input.encryptedTotpSecret,
        enabledAt: null,
        lastUsedStep: null,
        updatedAt: input.now,
      },
    });
  }

  async enableMfa(userId: string, now: Date) {
    await this.prisma.adminMfaCredential.update({
      where: { userId },
      data: { enabledAt: now },
    });
  }

  async markTotpStep(userId: string, step: bigint) {
    const result = await this.prisma.adminMfaCredential.updateMany({
      where: {
        userId,
        enabledAt: { not: null },
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
      },
      data: { lastUsedStep: step },
    });
    return result.count === 1;
  }

  async replaceRecoveryCodes(userId: string, codeHashes: string[], now: Date) {
    await this.prisma.$transaction(async (tx) => {
      await tx.adminRecoveryCode.deleteMany({ where: { userId } });
      await tx.adminRecoveryCode.createMany({
        data: codeHashes.map((codeHash) => ({
          userId,
          codeHash,
          createdAt: now,
        })),
      });
    });
  }

  async consumeRecoveryCode(userId: string, codeHash: string, now: Date) {
    const result = await this.prisma.adminRecoveryCode.updateMany({
      where: { userId, codeHash, usedAt: null },
      data: { usedAt: now },
    });
    return result.count === 1;
  }

  async createOtpChallenge(input: {
    phoneNumber: string;
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
    cooldownSeconds: number;
    now: Date;
  }) {
    await this.prisma.$transaction(async (tx) => {
      const latest = await tx.otpChallenge.findFirst({
        where: { phoneNumber: input.phoneNumber, purpose: OtpPurpose.ADMIN_LOGIN },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        const elapsed = input.now.getTime() - latest.createdAt.getTime();
        if (elapsed < input.cooldownSeconds * 1000) {
          throw new AppError({
            status: 429,
            code: 'RATE_LIMITED',
            message: 'Please wait before requesting another code',
          });
        }
      }
      await tx.otpChallenge.updateMany({
        where: {
          phoneNumber: input.phoneNumber,
          purpose: OtpPurpose.ADMIN_LOGIN,
          consumedAt: null,
        },
        data: { consumedAt: input.now },
      });
      await tx.otpChallenge.create({
        data: {
          phoneNumber: input.phoneNumber,
          purpose: OtpPurpose.ADMIN_LOGIN,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          maxAttempts: input.maxAttempts,
        },
      });
    });
  }

  async consumeAdminOtp(input: {
    phoneNumber: string;
    codeHash: string;
    now: Date;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.otpChallenge.findFirst({
        where: {
          phoneNumber: input.phoneNumber,
          purpose: OtpPurpose.ADMIN_LOGIN,
          consumedAt: null,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!challenge) return 'invalid' as const;
      if (isOtpExpired(challenge.expiresAt, input.now)) {
        await tx.otpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: input.now },
        });
        return 'expired' as const;
      }
      if (!canAttemptOtp(challenge.attempts, challenge.maxAttempts)) {
        return 'exhausted' as const;
      }
      if (!secretsMatch(challenge.codeHash, input.codeHash)) {
        const updated = await tx.otpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        return canAttemptOtp(updated.attempts, updated.maxAttempts)
          ? ('invalid' as const)
          : ('exhausted' as const);
      }
      const consumed = await tx.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: input.now },
      });
      if (consumed.count !== 1) return 'used' as const;
      return 'ok' as const;
    });
  }

  async issueRefreshSession(input: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }) {
    await this.prisma.refreshToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        familyId: input.familyId,
        expiresAt: input.expiresAt,
      },
    });
  }

  async revokeAllRefreshSessions(userId: string, now: Date) {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    return result.count;
  }

  async setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { status },
        select: {
          id: true,
          phoneNumber: true,
          role: true,
          status: true,
          displayName: true,
        },
      });
    } catch {
      return null;
    }
  }

  async setRiderAvailabilityOffline(riderId: string) {
    const result = await this.prisma.riderProfile.updateMany({
      where: { userId: riderId },
      data: { availability: 'OFFLINE' },
    });
    return result.count > 0;
  }

  async countActiveTripsForRider(riderId: string) {
    return this.prisma.booking.count({
      where: {
        riderId,
        status: { in: ['ACCEPTED', 'IN_PROGRESS'] },
      },
    });
  }
}
