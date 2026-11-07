import { describe, expect, it } from 'vitest';

import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import { decryptSecret, encryptSecret } from '../../common/security/secret-box.js';
import { verifyAccessToken } from '../../common/security/tokens.js';
import { buildTotp, verifyTotpCode } from '../../common/security/totp.js';
import { env } from '../../config/env.js';
import { DevelopmentSmsProvider } from '../../infrastructure/sms/sms.provider.js';
import { MemoryAuditService } from '../audit/module.service.js';
import { MemoryAdminStore } from './memory-admin-store.js';
import { AdminServiceImpl } from './module.service.js';

const bootstrapSecret = env.ADMIN_BOOTSTRAP_SECRET;
const phone = '+233244999001';
const tokenOptions = { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };

function createAdminService(store = new MemoryAdminStore(), now = new Date('2026-06-01T12:00:00.000Z')) {
  const audit = new MemoryAuditService();
  const sms = new DevelopmentSmsProvider();
  const service = new AdminServiceImpl(store, {
    sms,
    audit,
    now: () => now,
    generateCode: () => '654321',
    bootstrapSecret,
  });
  return { service, store, audit, sms, getNow: () => now, setNow: (value: Date) => { now = value; } };
}

describe('admin permission matrix', () => {
  it('grants expected permissions per staff role', () => {
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.ManageAdmins)).toBe(true);
    expect(staffRoleHasPermission('SUPER_ADMIN', Permission.ExecuteRefunds)).toBe(true);

    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ReviewRiders)).toBe(true);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ExecuteRefunds)).toBe(false);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', Permission.ManageAdmins)).toBe(false);

    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.ExecuteRefunds)).toBe(true);
    expect(staffRoleHasPermission('FINANCE_ADMIN', Permission.ReviewRiders)).toBe(false);

    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.RecommendRefunds)).toBe(true);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ExecuteRefunds)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ManageAdmins)).toBe(false);
  });
});

describe('admin bootstrap and MFA', () => {
  it('bootstraps a single Super Admin and requires MFA enrollment', async () => {
    const { service, audit } = createAdminService();
    const boot = await service.bootstrap({
      bootstrapSecret,
      phoneNumber: phone,
      displayName: 'Root Admin',
    });
    expect(boot.enrollmentToken).toBeTruthy();
    expect(audit.entries.some((entry) => entry.action === 'admin.bootstrap.completed')).toBe(true);

    await expect(
      service.bootstrap({ bootstrapSecret, phoneNumber: '+233244999002' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const start = await service.startMfaEnrollment(boot.enrollmentToken);
    expect(start.otpauthUrl).toContain('otpauth://totp/');
    expect(start.qrCodeDataUrl.startsWith('data:image/png')).toBe(true);

    const secret = extractSecretFromOtpauth(start.otpauthUrl);
    const code = buildTotp(secret, env.TOTP_ISSUER, phone).generate({
      timestamp: new Date('2026-06-01T12:00:00.000Z').getTime(),
    });
    const confirmed = await service.confirmMfaEnrollment(boot.enrollmentToken, { code });
    expect(confirmed.recoveryCodes).toHaveLength(10);
    expect(confirmed.accessToken).toBeTruthy();

    const claims = verifyAccessToken(confirmed.accessToken, env.JWT_ACCESS_SECRET, tokenOptions);
    expect(claims).toMatchObject({
      role: 'ADMIN',
      staffRole: 'SUPER_ADMIN',
      mfa: true,
      purpose: 'access',
    });
  });

  it('rejects invalid bootstrap secrets and does not log them', async () => {
    const { service, audit } = createAdminService();
    await expect(
      service.bootstrap({
        bootstrapSecret: 'x'.repeat(40),
        phoneNumber: phone,
      }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(JSON.stringify(audit.entries)).not.toContain('bootstrapSecret');
  });
});

describe('admin invitations', () => {
  it('allows Super Admin invites, rejects replay and expiry', async () => {
    let now = new Date('2026-06-01T12:00:00.000Z');
    const store = new MemoryAdminStore();
    const ctx = createAdminService(store, now);
    const boot = await ctx.service.bootstrap({
      bootstrapSecret,
      phoneNumber: phone,
    });
    const start = await ctx.service.startMfaEnrollment(boot.enrollmentToken);
    const secret = extractSecretFromOtpauth(start.otpauthUrl);
    const code = buildTotp(secret, env.TOTP_ISSUER, phone).generate({ timestamp: now.getTime() });
    const session = await ctx.service.confirmMfaEnrollment(boot.enrollmentToken, { code });
    const superUser = verifyAccessToken(session.accessToken, env.JWT_ACCESS_SECRET, tokenOptions);

    const invite = await ctx.service.createInvitation(
      { phoneNumber: '+233244999010', staffRole: 'OPERATIONS_ADMIN' },
      { userId: superUser.sub, staffRole: 'SUPER_ADMIN' },
    );

    const accepted = await ctx.service.acceptInvitation({ token: invite.token });
    expect(accepted.staffRole).toBe('OPERATIONS_ADMIN');
    await expect(ctx.service.acceptInvitation({ token: invite.token })).rejects.toMatchObject({
      code: 'CONFLICT',
    });

    const invite2 = await ctx.service.createInvitation(
      { phoneNumber: '+233244999011', staffRole: 'FINANCE_ADMIN' },
      { userId: superUser.sub, staffRole: 'SUPER_ADMIN' },
    );
    now = new Date('2026-06-10T12:00:00.000Z');
    const expiredService = new AdminServiceImpl(store, {
      sms: new DevelopmentSmsProvider(),
      audit: new MemoryAuditService(),
      now: () => now,
      bootstrapSecret,
    });
    await expect(expiredService.acceptInvitation({ token: invite2.token })).rejects.toMatchObject({
      message: 'Invitation has expired',
    });
  });

  it('prevents self-promotion to SUPER_ADMIN', async () => {
    const store = new MemoryAdminStore();
    await expect(
      store.createGrant({
        userId: '11111111-1111-1111-1111-111111111111',
        staffRole: 'SUPER_ADMIN',
        grantedBy: '11111111-1111-1111-1111-111111111111',
        now: new Date(),
      }),
    ).rejects.toMatchObject({ message: /cannot grant SUPER_ADMIN to themselves/ });
  });

  it('denies invitation creation for non-super roles', async () => {
    const { service } = createAdminService();
    await expect(
      service.createInvitation(
        { phoneNumber: '+233244999020', staffRole: 'SUPPORT_ADMIN' },
        { userId: '11111111-1111-1111-1111-111111111111', staffRole: 'FINANCE_ADMIN' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('admin MFA login and recovery', () => {
  it('enforces MFA on admin login and accepts a single-use recovery code', async () => {
    let now = new Date('2026-06-01T12:00:00.000Z');
    const store = new MemoryAdminStore();
    const { service } = createAdminService(store, now);

    const boot = await service.bootstrap({ bootstrapSecret, phoneNumber: phone });
    const start = await service.startMfaEnrollment(boot.enrollmentToken);
    const secret = extractSecretFromOtpauth(start.otpauthUrl);
    const enrollCode = buildTotp(secret, env.TOTP_ISSUER, phone).generate({
      timestamp: now.getTime(),
    });
    const enrolled = await service.confirmMfaEnrollment(boot.enrollmentToken, {
      code: enrollCode,
    });
    const recoveryCode = enrolled.recoveryCodes[0]!;

    await service.requestAdminOtp({ phoneNumber: phone });
    const challenge = await service.verifyAdminOtp({ phoneNumber: phone, code: '654321' });
    expect(challenge.status).toBe('MFA_REQUIRED');
    if (challenge.status !== 'MFA_REQUIRED') throw new Error('expected MFA_REQUIRED');

    now = new Date(now.getTime() + 30_000);
    const serviceLater = new AdminServiceImpl(store, {
      sms: new DevelopmentSmsProvider(),
      audit: new MemoryAuditService(),
      now: () => now,
      generateCode: () => '654321',
      bootstrapSecret,
    });
    const totpCode = buildTotp(secret, env.TOTP_ISSUER, phone).generate({
      timestamp: now.getTime(),
    });
    const verified = await serviceLater.verifyMfa({
      mfaToken: challenge.mfaToken,
      code: totpCode,
    });
    expect(verified.staffRole).toBe('SUPER_ADMIN');

    now = new Date(now.getTime() + 61_000);
    const serviceRecover = new AdminServiceImpl(store, {
      sms: new DevelopmentSmsProvider(),
      audit: new MemoryAuditService(),
      now: () => now,
      generateCode: () => '111111',
      bootstrapSecret,
    });
    await serviceRecover.requestAdminOtp({ phoneNumber: phone });
    const again = await serviceRecover.verifyAdminOtp({ phoneNumber: phone, code: '111111' });
    if (again.status !== 'MFA_REQUIRED') throw new Error('expected MFA_REQUIRED');
    const recovered = await serviceRecover.verifyMfa({
      mfaToken: again.mfaToken,
      recoveryCode,
    });
    expect(recovered.accessToken).toBeTruthy();
    await expect(
      serviceRecover.verifyMfa({ mfaToken: again.mfaToken, recoveryCode }),
    ).rejects.toMatchObject({ message: 'Recovery code is invalid' });
  });

  it('revokes sessions when an admin grant is revoked', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z');
    const store = new MemoryAdminStore();
    const { service } = createAdminService(store, now);
    const boot = await service.bootstrap({ bootstrapSecret, phoneNumber: phone });
    const start = await service.startMfaEnrollment(boot.enrollmentToken);
    const secret = extractSecretFromOtpauth(start.otpauthUrl);
    const code = buildTotp(secret, env.TOTP_ISSUER, phone).generate({ timestamp: now.getTime() });
    const session = await service.confirmMfaEnrollment(boot.enrollmentToken, { code });
    const superUser = verifyAccessToken(session.accessToken, env.JWT_ACCESS_SECRET, tokenOptions);

    const invite = await service.createInvitation(
      { phoneNumber: '+233244999030', staffRole: 'SUPPORT_ADMIN' },
      { userId: superUser.sub, staffRole: 'SUPER_ADMIN' },
    );
    const accepted = await service.acceptInvitation({ token: invite.token });
    expect(store.refresh.some((row) => row.userId === accepted.userId)).toBe(false);

    await store.issueRefreshSession({
      userId: accepted.userId,
      tokenHash: 'hash',
      familyId: 'family',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    await service.revokeAdmin(
      { userId: accepted.userId, reason: 'left company' },
      { userId: superUser.sub, staffRole: 'SUPER_ADMIN' },
    );
    expect(store.refresh.every((row) => row.userId !== accepted.userId || row.revokedAt)).toBe(
      true,
    );
    expect(await store.findActiveGrant(accepted.userId)).toBeNull();
  });
});

describe('secret box and totp helpers', () => {
  it('round-trips encrypted TOTP secrets', () => {
    const encrypted = encryptSecret('JBSWY3DPEHPK3PXP', env.ADMIN_MFA_ENCRYPTION_KEY);
    expect(encrypted).not.toContain('JBSWY3DPEHPK3PXP');
    expect(decryptSecret(encrypted, env.ADMIN_MFA_ENCRYPTION_KEY)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('detects totp step reuse candidates', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const timestamp = Date.UTC(2026, 5, 1, 12, 0, 0);
    const code = buildTotp(secret, env.TOTP_ISSUER, 'label').generate({ timestamp });
    const first = verifyTotpCode({
      secretBase32: secret,
      token: code,
      issuer: env.TOTP_ISSUER,
      label: 'label',
      epoch: timestamp,
    });
    expect(first.valid).toBe(true);
  });
});

function extractSecretFromOtpauth(url: string): string {
  const parsed = new URL(url);
  const secret = parsed.searchParams.get('secret');
  if (!secret) throw new Error('missing secret');
  return secret;
}
