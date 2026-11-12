import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import { AppError } from '../../common/errors/app-error.js';
import { generateOtpCode, hashOtpCode } from '../../common/security/otp.js';
import { decryptSecret, encryptSecret } from '../../common/security/secret-box.js';
import {
  createOpaqueToken,
  createRefreshToken,
  hashSecretValue,
  secretsMatch,
  signAccessToken,
  verifyAccessToken,
} from '../../common/security/tokens.js';
import {
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpOtpauthUrl,
  totpQrDataUrl,
  verifyTotpCode,
} from '../../common/security/totp.js';
import type { StaffRole } from '../../common/types/staff-roles.js';
import { canExposeDevelopmentOtp, env } from '../../config/env.js';
import { enqueueInAppNotification } from '../../infrastructure/notifications/notify.js';
import type { SmsProvider } from '../../infrastructure/sms/sms.provider.js';
import type { AuditService } from '../audit/module.service.js';
import type { AdminStore } from './admin-store.js';
import type {
  AcceptInvitationInput,
  AdminMfaConfirmInput,
  AdminMfaVerifyInput,
  AdminOtpRequestInput,
  AdminOtpVerifyInput,
  BootstrapAdminInput,
  CreateInvitationInput,
  ReinstateUserInput,
  RevokeAdminInput,
  SuspendUserInput,
} from './module.schema.js';

const tokenOptions = () => ({
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
});

export interface AdminServiceDeps {
  sms: SmsProvider;
  audit: AuditService;
  /** Optional — when set, suspension/reinstate enqueue in-app notifications. */
  prisma?: PrismaClient;
  now?: () => Date;
  generateCode?: () => string;
  bootstrapSecret?: string;
}

export interface AdminService {
  bootstrap(input: BootstrapAdminInput, ipAddress?: string): Promise<{
    userId: string;
    enrollmentToken: string;
    expiresIn: number;
  }>;
  createInvitation(
    input: CreateInvitationInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ): Promise<{ invitationId: string; expiresAt: string; token: string }>;
  acceptInvitation(input: AcceptInvitationInput, ipAddress?: string): Promise<{
    userId: string;
    staffRole: StaffRole;
    enrollmentToken: string;
    expiresIn: number;
  }>;
  requestAdminOtp(input: AdminOtpRequestInput): Promise<{ expiresIn: number; resendAfter: number; developmentCode?: string }>;
  verifyAdminOtp(input: AdminOtpVerifyInput): Promise<
    | { status: 'MFA_ENROLLMENT_REQUIRED'; enrollmentToken: string; expiresIn: number }
    | { status: 'MFA_REQUIRED'; mfaToken: string; expiresIn: number }
  >;
  startMfaEnrollment(enrollmentToken: string): Promise<{
    otpauthUrl: string;
    qrCodeDataUrl: string;
  }>;
  confirmMfaEnrollment(
    enrollmentToken: string,
    input: AdminMfaConfirmInput,
    ipAddress?: string,
  ): Promise<{
    recoveryCodes: string[];
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }>;
  verifyMfa(
    input: AdminMfaVerifyInput,
    ipAddress?: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    staffRole: StaffRole;
  }>;
  revokeAdmin(
    input: RevokeAdminInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ): Promise<{ revoked: boolean }>;
  /**
   * Suspend a passenger or rider. Does not cancel ACCEPTED/IN_PROGRESS trips,
   * does not modify token balances, and does not rewrite historical bookings.
   */
  suspendUser(
    input: SuspendUserInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ): Promise<{
    userId: string;
    status: 'SUSPENDED';
    activeTripsPreserved: number;
    sessionsRevoked: number;
  }>;
  reinstateUser(
    input: ReinstateUserInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ): Promise<{ userId: string; status: 'ACTIVE' }>;
  getMe(userId: string): Promise<{
    id: string;
    phoneNumber: string;
    role: 'ADMIN';
    status: string;
    displayName: string | null;
    staffRole: StaffRole;
    mfaEnabled: boolean;
  }>;
  assertPermission(staffRole: StaffRole, permission: Permission): void;
}

export class AdminServiceImpl implements AdminService {
  private readonly now: () => Date;
  private readonly generateCode: () => string;
  private readonly bootstrapSecret: string;

  constructor(
    private readonly store: AdminStore,
    private readonly deps: AdminServiceDeps,
  ) {
    this.now = deps.now ?? (() => new Date());
    this.generateCode = deps.generateCode ?? generateOtpCode;
    this.bootstrapSecret = deps.bootstrapSecret ?? env.ADMIN_BOOTSTRAP_SECRET;
  }

  assertPermission(staffRole: StaffRole, permission: Permission): void {
    if (!staffRoleHasPermission(staffRole, permission)) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource',
      });
    }
  }

  async bootstrap(input: BootstrapAdminInput, ipAddress?: string) {
    if (!this.bootstrapSecret || this.bootstrapSecret.length < 32) {
      throw new AppError({
        status: 503,
        code: 'SERVICE_UNAVAILABLE',
        message: 'Administrator bootstrap is not configured',
      });
    }
    if (
      !secretsEqual(input.bootstrapSecret, this.bootstrapSecret)
    ) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Bootstrap secret is invalid',
      });
    }

    const state = await this.store.getBootstrapState();
    if (state.completedAt) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Administrator bootstrap is already completed',
      });
    }
    if ((await this.store.countActiveSuperAdmins()) > 0) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'A Super Admin already exists',
      });
    }

    const existing = await this.store.findUserByPhone(input.phoneNumber);
    if (existing) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Phone number is already registered',
      });
    }

    const now = this.now();
    const user = await this.store.createAdminUser({
      phoneNumber: input.phoneNumber,
      displayName: input.displayName,
    });
    await this.store.createGrant({
      userId: user.id,
      staffRole: 'SUPER_ADMIN',
      grantedBy: null,
      now,
    });
    await this.store.completeBootstrap(user.id, now);

    await this.deps.audit.record({
      actorId: user.id,
      action: 'admin.bootstrap.completed',
      entityType: 'user',
      entityId: user.id,
      metadata: { staffRole: 'SUPER_ADMIN' },
      ipAddress,
    });

    const enrollmentToken = signAccessToken(
      {
        sub: user.id,
        role: 'ADMIN',
        staffRole: 'SUPER_ADMIN',
        purpose: 'admin_mfa_enrollment',
      },
      env.JWT_ACCESS_SECRET,
      env.ADMIN_MFA_PENDING_TTL_SECONDS,
      tokenOptions(),
    );

    return {
      userId: user.id,
      enrollmentToken,
      expiresIn: env.ADMIN_MFA_PENDING_TTL_SECONDS,
    };
  }

  async createInvitation(
    input: CreateInvitationInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ) {
    this.assertPermission(actor.staffRole, Permission.ManageAdmins);
    if (actor.staffRole !== 'SUPER_ADMIN') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only Super Admin can invite administrators',
      });
    }
    if (input.staffRole === 'SUPER_ADMIN' && input.phoneNumber) {
      // self-promotion blocked at accept/grant time via grantedBy !== userId; invite is fine
    }

    const existing = await this.store.findUserByPhone(input.phoneNumber);
    if (existing && existing.role !== 'ADMIN') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Phone number is registered with a different role',
      });
    }

    const now = this.now();
    const token = createOpaqueToken(32);
    const invitation = await this.store.createInvitation({
      phoneNumber: input.phoneNumber,
      staffRole: input.staffRole,
      tokenHash: hashSecretValue(token, env.JWT_REFRESH_SECRET),
      invitedById: actor.userId,
      expiresAt: new Date(now.getTime() + env.ADMIN_INVITE_TTL_SECONDS * 1000),
      now,
    });

    await this.deps.audit.record({
      actorId: actor.userId,
      action: 'admin.invitation.created',
      entityType: 'admin_invitation',
      entityId: invitation.id,
      metadata: { staffRole: input.staffRole },
      ipAddress,
    });

    return {
      invitationId: invitation.id,
      expiresAt: invitation.expiresAt.toISOString(),
      token,
    };
  }

  async acceptInvitation(input: AcceptInvitationInput, ipAddress?: string) {
    const now = this.now();
    const invitation = await this.store.findInvitationByTokenHash(
      hashSecretValue(input.token, env.JWT_REFRESH_SECRET),
    );
    if (!invitation || invitation.revokedAt) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Invitation is invalid',
      });
    }
    if (invitation.acceptedAt) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Invitation has already been used',
      });
    }
    if (invitation.expiresAt.getTime() <= now.getTime()) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Invitation has expired',
      });
    }

    let user = await this.store.findUserByPhone(invitation.phoneNumber);
    if (!user) {
      user = await this.store.createAdminUser({ phoneNumber: invitation.phoneNumber });
    } else if (user.role !== 'ADMIN') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Phone number is registered with a different role',
      });
    }

    if (invitation.staffRole === 'SUPER_ADMIN' && invitation.invitedById === user.id) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Administrators cannot grant SUPER_ADMIN to themselves',
      });
    }

    const accepted = await this.store.acceptInvitation(invitation.id, now);
    if (!accepted) {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Invitation has already been used',
      });
    }

    await this.store.createGrant({
      userId: user.id,
      staffRole: invitation.staffRole,
      grantedBy: invitation.invitedById,
      now,
    });
    await this.store.revokeAllRefreshSessions(user.id, now);

    await this.deps.audit.record({
      actorId: invitation.invitedById,
      action: 'admin.invitation.accepted',
      entityType: 'user',
      entityId: user.id,
      metadata: { staffRole: invitation.staffRole, invitationId: invitation.id },
      ipAddress,
    });

    const enrollmentToken = signAccessToken(
      {
        sub: user.id,
        role: 'ADMIN',
        staffRole: invitation.staffRole,
        purpose: 'admin_mfa_enrollment',
      },
      env.JWT_ACCESS_SECRET,
      env.ADMIN_MFA_PENDING_TTL_SECONDS,
      tokenOptions(),
    );

    return {
      userId: user.id,
      staffRole: invitation.staffRole,
      enrollmentToken,
      expiresIn: env.ADMIN_MFA_PENDING_TTL_SECONDS,
    };
  }

  async requestAdminOtp(input: AdminOtpRequestInput) {
    const now = this.now();
    const code = this.generateCode();
    await this.store.createOtpChallenge({
      phoneNumber: input.phoneNumber,
      codeHash: hashOtpCode(code, env.OTP_HASH_SECRET),
      expiresAt: new Date(now.getTime() + env.OTP_TTL_SECONDS * 1000),
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
      now,
    });
    await this.deps.sms.send({
      to: input.phoneNumber,
      body: `Your Cyrlo Ride admin code is ${code}. It expires in ${env.OTP_TTL_SECONDS / 60} minutes.`,
    });
    const result: {
      expiresIn: number;
      resendAfter: number;
      developmentCode?: string;
    } = {
      expiresIn: env.OTP_TTL_SECONDS,
      resendAfter: env.OTP_RESEND_COOLDOWN_SECONDS,
    };
    if (canExposeDevelopmentOtp(env)) {
      result.developmentCode = code;
    }
    return result;
  }

  async verifyAdminOtp(input: AdminOtpVerifyInput) {
    const now = this.now();
    const result = await this.store.consumeAdminOtp({
      phoneNumber: input.phoneNumber,
      codeHash: hashOtpCode(input.code, env.OTP_HASH_SECRET),
      now,
    });
    if (result !== 'ok') {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message:
          result === 'expired'
            ? 'OTP has expired'
            : result === 'exhausted'
              ? 'OTP attempts exhausted'
              : result === 'used'
                ? 'OTP has already been used'
                : 'OTP is invalid',
      });
    }

    const user = await this.store.findUserByPhone(input.phoneNumber);
    if (!user || user.role !== 'ADMIN' || user.status === 'DELETED') {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'OTP is invalid',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is suspended',
      });
    }

    const grant = await this.store.findActiveGrant(user.id);
    if (!grant) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'No active administrator grant',
      });
    }

    const mfa = await this.store.getMfa(user.id);
    if (!mfa?.enabledAt) {
      const enrollmentToken = signAccessToken(
        {
          sub: user.id,
          role: 'ADMIN',
          staffRole: grant.staffRole,
          purpose: 'admin_mfa_enrollment',
        },
        env.JWT_ACCESS_SECRET,
        env.ADMIN_MFA_PENDING_TTL_SECONDS,
        tokenOptions(),
      );
      return {
        status: 'MFA_ENROLLMENT_REQUIRED' as const,
        enrollmentToken,
        expiresIn: env.ADMIN_MFA_PENDING_TTL_SECONDS,
      };
    }

    const mfaToken = signAccessToken(
      {
        sub: user.id,
        role: 'ADMIN',
        staffRole: grant.staffRole,
        purpose: 'admin_mfa_pending',
      },
      env.JWT_ACCESS_SECRET,
      env.ADMIN_MFA_PENDING_TTL_SECONDS,
      tokenOptions(),
    );
    return {
      status: 'MFA_REQUIRED' as const,
      mfaToken,
      expiresIn: env.ADMIN_MFA_PENDING_TTL_SECONDS,
    };
  }

  async startMfaEnrollment(enrollmentToken: string) {
    const claims = requirePurposeToken(enrollmentToken, 'admin_mfa_enrollment');
    await this.requireActiveAdmin(claims.sub);
    const secret = generateTotpSecret();
    await this.store.upsertMfaSecret({
      userId: claims.sub,
      encryptedTotpSecret: encryptSecret(secret, env.ADMIN_MFA_ENCRYPTION_KEY),
      now: this.now(),
    });
    const label = (await this.store.findUserById(claims.sub))?.phoneNumber ?? claims.sub;
    const otpauthUrl = totpOtpauthUrl(secret, env.TOTP_ISSUER, label);
    const qrCodeDataUrl = await totpQrDataUrl(otpauthUrl);
    return { otpauthUrl, qrCodeDataUrl };
  }

  async confirmMfaEnrollment(
    enrollmentToken: string,
    input: AdminMfaConfirmInput,
    ipAddress?: string,
  ) {
    const claims = requirePurposeToken(enrollmentToken, 'admin_mfa_enrollment');
    const grant = await this.requireActiveAdmin(claims.sub);
    const mfa = await this.store.getMfa(claims.sub);
    if (!mfa) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'MFA enrollment has not been started',
      });
    }
    const secret = decryptSecret(mfa.encryptedTotpSecret, env.ADMIN_MFA_ENCRYPTION_KEY);
    const label = (await this.store.findUserById(claims.sub))?.phoneNumber ?? claims.sub;
    const verified = verifyTotpCode({
      secretBase32: secret,
      token: input.code,
      issuer: env.TOTP_ISSUER,
      label,
      epoch: this.now().getTime(),
    });
    if (!verified.valid || verified.step === null) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'MFA code is invalid',
      });
    }

    const now = this.now();
    await this.store.enableMfa(claims.sub, now);
    await this.store.markTotpStep(claims.sub, BigInt(verified.step));
    const recoveryCodes = generateRecoveryCodes(10);
    await this.store.replaceRecoveryCodes(
      claims.sub,
      recoveryCodes.map((code) => hashRecoveryCode(code, env.OTP_HASH_SECRET)),
      now,
    );

    await this.deps.audit.record({
      actorId: claims.sub,
      action: 'admin.mfa.enrolled',
      entityType: 'user',
      entityId: claims.sub,
      ipAddress,
    });

    const session = await this.issueStaffSession(claims.sub, grant.staffRole, now);
    return { recoveryCodes, ...session };
  }

  async verifyMfa(input: AdminMfaVerifyInput, ipAddress?: string) {
    const claims = requirePurposeToken(input.mfaToken, 'admin_mfa_pending');
    const grant = await this.requireActiveAdmin(claims.sub);
    const mfa = await this.store.getMfa(claims.sub);
    if (!mfa?.enabledAt) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Administrator MFA enrollment is required',
      });
    }

    const now = this.now();
    if (input.recoveryCode) {
      const ok = await this.store.consumeRecoveryCode(
        claims.sub,
        hashRecoveryCode(input.recoveryCode, env.OTP_HASH_SECRET),
        now,
      );
      if (!ok) {
        throw new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Recovery code is invalid',
        });
      }
      await this.deps.audit.record({
        actorId: claims.sub,
        action: 'admin.mfa.recovery_used',
        entityType: 'user',
        entityId: claims.sub,
        ipAddress,
      });
      const session = await this.issueStaffSession(claims.sub, grant.staffRole, now);
      return { ...session, staffRole: grant.staffRole };
    }

    if (!input.code) {
      throw new AppError({
        status: 400,
        code: 'VALIDATION_ERROR',
        message: 'MFA code is required',
      });
    }

    const secret = decryptSecret(mfa.encryptedTotpSecret, env.ADMIN_MFA_ENCRYPTION_KEY);
    const label = (await this.store.findUserById(claims.sub))?.phoneNumber ?? claims.sub;
    const verified = verifyTotpCode({
      secretBase32: secret,
      token: input.code,
      issuer: env.TOTP_ISSUER,
      label,
      epoch: now.getTime(),
    });
    if (!verified.valid || verified.step === null) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'MFA code is invalid',
      });
    }
    const marked = await this.store.markTotpStep(claims.sub, BigInt(verified.step));
    if (!marked) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'MFA code has already been used',
      });
    }

    await this.deps.audit.record({
      actorId: claims.sub,
      action: 'admin.mfa.verified',
      entityType: 'user',
      entityId: claims.sub,
      ipAddress,
    });

    const session = await this.issueStaffSession(claims.sub, grant.staffRole, now);
    return { ...session, staffRole: grant.staffRole };
  }

  async revokeAdmin(
    input: RevokeAdminInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ) {
    this.assertPermission(actor.staffRole, Permission.ManageAdmins);
    if (actor.staffRole !== 'SUPER_ADMIN') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Only Super Admin can revoke administrators',
      });
    }
    if (input.userId === actor.userId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Administrators cannot revoke themselves',
      });
    }

    const now = this.now();
    const revoked = await this.store.revokeActiveGrants(input.userId, now);
    await this.store.revokeAllRefreshSessions(input.userId, now);
    await this.deps.audit.record({
      actorId: actor.userId,
      action: 'admin.grant.revoked',
      entityType: 'user',
      entityId: input.userId,
      metadata: { reason: input.reason },
      ipAddress,
    });
    return { revoked: revoked > 0 };
  }

  async suspendUser(
    input: SuspendUserInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ) {
    this.assertPermission(actor.staffRole, Permission.SuspendReinstateRiders);
    if (input.userId === actor.userId) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Administrators cannot suspend themselves',
      });
    }

    const target = await this.store.findUserById(input.userId);
    if (!target || target.status === 'DELETED') {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    if (target.role === 'ADMIN') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Use grant revoke to remove administrator access',
      });
    }

    const now = this.now();
    const activeTripsPreserved =
      target.role === 'RIDER' ? await this.store.countActiveTripsForRider(input.userId) : 0;

    if (target.status !== 'SUSPENDED') {
      const updated = await this.store.setUserStatus(input.userId, 'SUSPENDED');
      if (!updated) {
        throw new AppError({
          status: 404,
          code: 'NOT_FOUND',
          message: 'User not found',
        });
      }
    }

    // Intent offline only — does not cancel ACCEPTED / IN_PROGRESS bookings.
    if (target.role === 'RIDER') {
      await this.store.setRiderAvailabilityOffline(input.userId);
    }

    const sessionsRevoked = await this.store.revokeAllRefreshSessions(input.userId, now);

    await this.deps.audit.record({
      actorId: actor.userId,
      action: 'admin.user.suspended',
      entityType: 'user',
      entityId: input.userId,
      metadata: {
        reason: input.reason,
        previousStatus: target.status,
        role: target.role,
        activeTripsPreserved,
        sessionsRevoked,
      },
      ipAddress,
    });

    if (this.deps.prisma) {
      enqueueInAppNotification(this.deps.prisma, {
        userId: input.userId,
        eventType: 'account.suspended',
        category: 'GENERAL',
        title: 'Account suspended',
        body: 'Your Cyrlo Ride account has been suspended. Contact support if you need help.',
        entityType: 'user',
        entityId: input.userId,
        channels: ['IN_APP', 'PUSH'],
        dedupeKey: `account.suspended:${input.userId}:${now.toISOString()}`,
        data: { status: 'SUSPENDED' },
      });
    }

    return {
      userId: input.userId,
      status: 'SUSPENDED' as const,
      activeTripsPreserved,
      sessionsRevoked,
    };
  }

  async reinstateUser(
    input: ReinstateUserInput,
    actor: { userId: string; staffRole: StaffRole },
    ipAddress?: string,
  ) {
    this.assertPermission(actor.staffRole, Permission.SuspendReinstateRiders);

    const target = await this.store.findUserById(input.userId);
    if (!target || target.status === 'DELETED') {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }
    if (target.role === 'ADMIN') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'Administrator access is managed through grants, not reinstate',
      });
    }
    if (target.status !== 'SUSPENDED') {
      throw new AppError({
        status: 409,
        code: 'CONFLICT',
        message: 'User is not suspended',
      });
    }

    const updated = await this.store.setUserStatus(input.userId, 'ACTIVE');
    if (!updated) {
      throw new AppError({
        status: 404,
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    }

    await this.deps.audit.record({
      actorId: actor.userId,
      action: 'admin.user.reinstated',
      entityType: 'user',
      entityId: input.userId,
      metadata: {
        reason: input.reason,
        role: target.role,
      },
      ipAddress,
    });

    if (this.deps.prisma) {
      enqueueInAppNotification(this.deps.prisma, {
        userId: input.userId,
        eventType: 'account.reinstated',
        category: 'GENERAL',
        title: 'Account reinstated',
        body: 'Your Cyrlo Ride account has been reinstated.',
        entityType: 'user',
        entityId: input.userId,
        channels: ['IN_APP', 'PUSH'],
        dedupeKey: `account.reinstated:${input.userId}:${this.now().toISOString()}`,
        data: { status: 'ACTIVE' },
      });
    }

    return { userId: input.userId, status: 'ACTIVE' as const };
  }

  async getMe(userId: string) {
    const user = await this.requireActiveAdmin(userId);
    const record = await this.store.findUserById(userId);
    const mfa = await this.store.getMfa(userId);
    if (!record) {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }
    return {
      id: record.id,
      phoneNumber: record.phoneNumber,
      role: 'ADMIN' as const,
      status: record.status,
      displayName: record.displayName,
      staffRole: user.staffRole,
      mfaEnabled: Boolean(mfa?.enabledAt),
    };
  }

  private async requireActiveAdmin(userId: string) {
    const user = await this.store.findUserById(userId);
    if (!user || user.role !== 'ADMIN' || user.status === 'DELETED') {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is suspended',
      });
    }
    const grant = await this.store.findActiveGrant(userId);
    if (!grant) {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'No active administrator grant',
      });
    }
    return { user, staffRole: grant.staffRole };
  }

  private async issueStaffSession(userId: string, staffRole: StaffRole, now: Date) {
    const refreshToken = createRefreshToken();
    await this.store.issueRefreshSession({
      userId,
      tokenHash: hashSecretValue(refreshToken, env.JWT_REFRESH_SECRET),
      familyId: randomUUID(),
      expiresAt: new Date(now.getTime() + env.JWT_REFRESH_TTL_SECONDS * 1000),
    });
    const mfaAt = Math.floor(now.getTime() / 1000);
    return {
      accessToken: signAccessToken(
        {
          sub: userId,
          role: 'ADMIN',
          staffRole,
          mfa: true,
          mfaAt,
          purpose: 'access',
        },
        env.JWT_ACCESS_SECRET,
        env.JWT_ACCESS_TTL_SECONDS,
        tokenOptions(),
      ),
      refreshToken,
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    };
  }
}

function requirePurposeToken(
  token: string,
  purpose: 'admin_mfa_pending' | 'admin_mfa_enrollment',
) {
  const claims = verifyAccessToken(token, env.JWT_ACCESS_SECRET, tokenOptions());
  if (claims.role !== 'ADMIN' || claims.purpose !== purpose) {
    throw new AppError({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Access token is invalid or expired',
    });
  }
  return claims;
}

function secretsEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    secretsMatch(right, right);
    return false;
  }
  return secretsMatch(left, right);
}
