import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { env } from '../../config/env.js';
import { hashOtpCode } from '../../common/security/otp.js';
import { hashSecretValue } from '../../common/security/tokens.js';
import { AuthRepository } from './module.repository.js';

const prisma = new PrismaClient();
const marker = `auth-db-${Date.now()}`;
const createdPhones: string[] = [];

function hashOtp(value: string) {
  return hashOtpCode(value, env.OTP_HASH_SECRET);
}

function hashToken(value: string) {
  return hashSecretValue(value, env.JWT_REFRESH_SECRET);
}

describe('auth repository postgres side-effects', () => {
  const repository = new AuthRepository(prisma);

  beforeAll(async () => {
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({
      where: { user: { phoneNumber: { in: createdPhones } } },
    });
    await prisma.otpChallenge.deleteMany({
      where: { phoneNumber: { in: createdPhones } },
    });
    await prisma.passengerProfile.deleteMany({
      where: { user: { phoneNumber: { in: createdPhones } } },
    });
    await prisma.user.deleteMany({ where: { phoneNumber: { in: createdPhones } } });
    await prisma.$disconnect();
  });

  it('persists OTP attempt increments after wrong code', async () => {
    const phoneNumber = `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`;
    createdPhones.push(phoneNumber);
    const now = new Date();
    await prisma.otpChallenge.create({
      data: {
        phoneNumber,
        purpose: 'LOGIN',
        codeHash: hashOtp('good-code'),
        expiresAt: new Date(now.getTime() + 60_000),
        maxAttempts: 5,
        attempts: 0,
      },
    });

    await expect(
      repository.verifyOtpAndCreateSession({
        phoneNumber,
        codeHash: hashOtp('bad-code'),
        role: 'PASSENGER',
        refreshTokenHash: hashToken(`rt-${marker}-1`),
        refreshExpiresAt: new Date(now.getTime() + 86_400_000),
        familyId: randomUUID(),
        now,
      }),
    ).rejects.toMatchObject({ message: 'OTP is invalid' });

    const challenge = await prisma.otpChallenge.findFirst({
      where: { phoneNumber, purpose: 'LOGIN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(challenge?.attempts).toBe(1);
  });

  it('persists refresh-family revocation on reuse detection', async () => {
    const phoneNumber = `+23320${randomUUID().replace(/-/g, '').slice(0, 9)}`;
    createdPhones.push(phoneNumber);
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        phoneNumber,
        role: 'PASSENGER',
        status: 'ACTIVE',
        passengerProfile: { create: { fullName: `${marker} user` } },
      },
    });
    const familyId = randomUUID();
    const presentedHash = hashToken(`old-${familyId}`);
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: presentedHash,
        expiresAt: new Date(now.getTime() + 86_400_000),
        revokedAt: now,
      },
    });
    const sibling = await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(`sibling-${familyId}`),
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });

    await expect(
      repository.rotateRefreshSession({
        presentedTokenHash: presentedHash,
        nextTokenHash: hashToken(`next-${familyId}`),
        nextExpiresAt: new Date(now.getTime() + 86_400_000),
        now,
      }),
    ).rejects.toMatchObject({ message: 'Refresh token reuse detected' });

    const after = await prisma.refreshToken.findUnique({ where: { id: sibling.id } });
    expect(after?.revokedAt).not.toBeNull();
  });
});
