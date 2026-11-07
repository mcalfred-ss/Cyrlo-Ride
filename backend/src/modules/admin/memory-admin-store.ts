import { randomUUID } from 'node:crypto';

import { AppError } from '../../common/errors/app-error.js';
import { canAttemptOtp, isOtpExpired } from '../../common/security/otp.js';
import { secretsMatch } from '../../common/security/tokens.js';
import type { StaffRole } from '../../common/types/staff-roles.js';
import type {
  AdminGrantRecord,
  AdminInvitationRecord,
  AdminMfaRecord,
  AdminRecoveryRecord,
  AdminStore,
  AdminUserRecord,
} from './admin-store.js';

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

export class MemoryAdminStore implements AdminStore {
  bootstrap: { completedAt: Date | null; completedBy: string | null } = {
    completedAt: null,
    completedBy: null,
  };
  users = new Map<string, AdminUserRecord>();
  usersByPhone = new Map<string, string>();
  grants: AdminGrantRecord[] = [];
  invitations: AdminInvitationRecord[] = [];
  mfa = new Map<string, AdminMfaRecord>();
  recovery: AdminRecoveryRecord[] = [];
  otp: OtpRow[] = [];
  refresh: Array<{ userId: string; tokenHash: string; familyId: string; revokedAt: Date | null }> =
    [];
  riderAvailability = new Map<string, 'OFFLINE' | 'AVAILABLE' | 'BUSY'>();
  activeTripsByRider = new Map<string, number>();

  async getBootstrapState() {
    return { ...this.bootstrap };
  }

  async completeBootstrap(userId: string, now: Date): Promise<void> {
    if (this.bootstrap.completedAt) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Administrator bootstrap is already completed',
      });
    }
    this.bootstrap = { completedAt: now, completedBy: userId };
  }

  async findUserByPhone(phoneNumber: string) {
    const id = this.usersByPhone.get(phoneNumber);
    return id ? structuredClone(this.users.get(id)!) : null;
  }

  async findUserById(id: string) {
    const user = this.users.get(id);
    return user ? structuredClone(user) : null;
  }

  async createAdminUser(input: { phoneNumber: string; displayName?: string | null }) {
    if (this.usersByPhone.has(input.phoneNumber)) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Phone number is already registered',
      });
    }
    const user: AdminUserRecord = {
      id: randomUUID(),
      phoneNumber: input.phoneNumber,
      role: 'ADMIN',
      status: 'ACTIVE',
      displayName: input.displayName ?? null,
    };
    this.users.set(user.id, user);
    this.usersByPhone.set(user.phoneNumber, user.id);
    return structuredClone(user);
  }

  async findActiveGrant(userId: string) {
    const grant = this.grants
      .filter((row) => row.userId === userId && row.revokedAt === null)
      .sort((a, b) => b.grantedAt.getTime() - a.grantedAt.getTime())[0];
    return grant ? structuredClone(grant) : null;
  }

  async countActiveSuperAdmins() {
    return this.grants.filter(
      (row) => row.staffRole === 'SUPER_ADMIN' && row.revokedAt === null,
    ).length;
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
    await this.revokeActiveGrants(input.userId, input.now);
    const grant: AdminGrantRecord = {
      id: randomUUID(),
      userId: input.userId,
      staffRole: input.staffRole,
      grantedBy: input.grantedBy,
      grantedAt: input.now,
      revokedAt: null,
    };
    this.grants.push(grant);
    return structuredClone(grant);
  }

  async revokeActiveGrants(userId: string, now: Date) {
    let count = 0;
    for (const grant of this.grants) {
      if (grant.userId === userId && grant.revokedAt === null) {
        grant.revokedAt = now;
        count += 1;
      }
    }
    return count;
  }

  async createInvitation(input: {
    phoneNumber: string;
    staffRole: StaffRole;
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
    now: Date;
  }) {
    const invitation: AdminInvitationRecord = {
      id: randomUUID(),
      phoneNumber: input.phoneNumber,
      staffRole: input.staffRole,
      tokenHash: input.tokenHash,
      invitedById: input.invitedById,
      expiresAt: input.expiresAt,
      acceptedAt: null,
      revokedAt: null,
      createdAt: input.now,
    };
    this.invitations.push(invitation);
    return structuredClone(invitation);
  }

  async findInvitationByTokenHash(tokenHash: string) {
    const invitation = this.invitations.find((row) => row.tokenHash === tokenHash);
    return invitation ? structuredClone(invitation) : null;
  }

  async acceptInvitation(id: string, now: Date) {
    const invitation = this.invitations.find((row) => row.id === id);
    if (!invitation || invitation.acceptedAt || invitation.revokedAt) return false;
    invitation.acceptedAt = now;
    return true;
  }

  async getMfa(userId: string) {
    const row = this.mfa.get(userId);
    return row ? structuredClone(row) : null;
  }

  async upsertMfaSecret(input: {
    userId: string;
    encryptedTotpSecret: string;
    now: Date;
  }) {
    this.mfa.set(input.userId, {
      userId: input.userId,
      encryptedTotpSecret: input.encryptedTotpSecret,
      enabledAt: null,
      lastUsedStep: null,
    });
  }

  async enableMfa(userId: string, now: Date) {
    const row = this.mfa.get(userId);
    if (!row) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'MFA enrollment has not been started',
      });
    }
    row.enabledAt = now;
  }

  async markTotpStep(userId: string, step: bigint) {
    const row = this.mfa.get(userId);
    if (!row || !row.enabledAt) return false;
    if (row.lastUsedStep !== null && step <= row.lastUsedStep) return false;
    row.lastUsedStep = step;
    return true;
  }

  async replaceRecoveryCodes(userId: string, codeHashes: string[], _now: Date) {
    this.recovery = this.recovery.filter((row) => row.userId !== userId);
    for (const codeHash of codeHashes) {
      this.recovery.push({
        id: randomUUID(),
        userId,
        codeHash,
        usedAt: null,
      });
    }
  }

  async consumeRecoveryCode(userId: string, codeHash: string, now: Date) {
    const row = this.recovery.find(
      (item) => item.userId === userId && item.codeHash === codeHash && item.usedAt === null,
    );
    if (!row) return false;
    row.usedAt = now;
    return true;
  }

  async createOtpChallenge(input: {
    phoneNumber: string;
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
    cooldownSeconds: number;
    now: Date;
  }) {
    const latest = [...this.otp]
      .filter((row) => row.phoneNumber === input.phoneNumber)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (latest && input.now.getTime() - latest.createdAt.getTime() < input.cooldownSeconds * 1000) {
      throw new AppError({
        status: 429,
        code: 'RATE_LIMITED',
        message: 'Please wait before requesting another code',
      });
    }
    for (const row of this.otp) {
      if (row.phoneNumber === input.phoneNumber && row.consumedAt === null) {
        row.consumedAt = input.now;
      }
    }
    this.otp.push({
      id: randomUUID(),
      phoneNumber: input.phoneNumber,
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      consumedAt: null,
      createdAt: input.now,
    });
  }

  async consumeAdminOtp(input: {
    phoneNumber: string;
    codeHash: string;
    now: Date;
  }) {
    const challenge = [...this.otp]
      .filter((row) => row.phoneNumber === input.phoneNumber && row.consumedAt === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!challenge) return 'invalid';
    if (isOtpExpired(challenge.expiresAt, input.now)) {
      challenge.consumedAt = input.now;
      return 'expired';
    }
    if (!canAttemptOtp(challenge.attempts, challenge.maxAttempts)) return 'exhausted';
    if (!secretsMatch(challenge.codeHash, input.codeHash)) {
      challenge.attempts += 1;
      return canAttemptOtp(challenge.attempts, challenge.maxAttempts) ? 'invalid' : 'exhausted';
    }
    if (challenge.consumedAt) return 'used';
    challenge.consumedAt = input.now;
    return 'ok';
  }

  async issueRefreshSession(input: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }) {
    this.refresh.push({
      userId: input.userId,
      tokenHash: input.tokenHash,
      familyId: input.familyId,
      revokedAt: null,
    });
  }

  async revokeAllRefreshSessions(userId: string, now: Date) {
    let count = 0;
    for (const row of this.refresh) {
      if (row.userId === userId && row.revokedAt === null) {
        row.revokedAt = now;
        count += 1;
      }
    }
    return count;
  }

  async setUserStatus(userId: string, status: 'ACTIVE' | 'SUSPENDED') {
    const user = this.users.get(userId);
    if (!user) return null;
    const updated = { ...user, status };
    this.users.set(userId, updated);
    return updated;
  }

  async setRiderAvailabilityOffline(riderId: string) {
    if (!this.users.has(riderId)) return false;
    this.riderAvailability.set(riderId, 'OFFLINE');
    return true;
  }

  async countActiveTripsForRider(riderId: string) {
    return this.activeTripsByRider.get(riderId) ?? 0;
  }
}
