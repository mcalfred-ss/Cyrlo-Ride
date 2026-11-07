import type { StaffRole } from '../../common/types/staff-roles.js';

export interface AdminUserRecord {
  id: string;
  phoneNumber: string;
  role: 'PASSENGER' | 'RIDER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  displayName: string | null;
}

export interface AdminGrantRecord {
  id: string;
  userId: string;
  staffRole: StaffRole;
  grantedBy: string | null;
  grantedAt: Date;
  revokedAt: Date | null;
}

export interface AdminInvitationRecord {
  id: string;
  phoneNumber: string;
  staffRole: StaffRole;
  tokenHash: string;
  invitedById: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface AdminMfaRecord {
  userId: string;
  encryptedTotpSecret: string;
  enabledAt: Date | null;
  lastUsedStep: bigint | null;
}

export interface AdminRecoveryRecord {
  id: string;
  userId: string;
  codeHash: string;
  usedAt: Date | null;
}

export interface AdminStore {
  getBootstrapState(): Promise<{ completedAt: Date | null; completedBy: string | null }>;
  completeBootstrap(userId: string, now: Date): Promise<void>;

  findUserByPhone(phoneNumber: string): Promise<AdminUserRecord | null>;
  findUserById(id: string): Promise<AdminUserRecord | null>;
  createAdminUser(input: {
    phoneNumber: string;
    displayName?: string | null;
  }): Promise<AdminUserRecord>;

  findActiveGrant(userId: string): Promise<AdminGrantRecord | null>;
  countActiveSuperAdmins(): Promise<number>;
  createGrant(input: {
    userId: string;
    staffRole: StaffRole;
    grantedBy: string | null;
    now: Date;
  }): Promise<AdminGrantRecord>;
  revokeActiveGrants(userId: string, now: Date): Promise<number>;

  createInvitation(input: {
    phoneNumber: string;
    staffRole: StaffRole;
    tokenHash: string;
    invitedById: string;
    expiresAt: Date;
    now: Date;
  }): Promise<AdminInvitationRecord>;
  findInvitationByTokenHash(tokenHash: string): Promise<AdminInvitationRecord | null>;
  acceptInvitation(id: string, now: Date): Promise<boolean>;

  getMfa(userId: string): Promise<AdminMfaRecord | null>;
  upsertMfaSecret(input: {
    userId: string;
    encryptedTotpSecret: string;
    now: Date;
  }): Promise<void>;
  enableMfa(userId: string, now: Date): Promise<void>;
  markTotpStep(userId: string, step: bigint): Promise<boolean>;
  replaceRecoveryCodes(userId: string, codeHashes: string[], now: Date): Promise<void>;
  consumeRecoveryCode(userId: string, codeHash: string, now: Date): Promise<boolean>;

  createOtpChallenge(input: {
    phoneNumber: string;
    codeHash: string;
    expiresAt: Date;
    maxAttempts: number;
    cooldownSeconds: number;
    now: Date;
  }): Promise<void>;
  consumeAdminOtp(input: {
    phoneNumber: string;
    codeHash: string;
    now: Date;
  }): Promise<'ok' | 'invalid' | 'expired' | 'exhausted' | 'used'>;

  issueRefreshSession(input: {
    userId: string;
    tokenHash: string;
    familyId: string;
    expiresAt: Date;
  }): Promise<void>;
  revokeAllRefreshSessions(userId: string, now: Date): Promise<number>;

  setUserStatus(
    userId: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<AdminUserRecord | null>;
  /** Intent offline only — does not cancel ACCEPTED/IN_PROGRESS bookings. */
  setRiderAvailabilityOffline(riderId: string): Promise<boolean>;
  countActiveTripsForRider(riderId: string): Promise<number>;
}
