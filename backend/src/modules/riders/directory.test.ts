import { randomUUID } from 'node:crypto';

import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import { AppError } from '../../common/errors/app-error.js';
import { errorHandler } from '../../common/errors/error-handler.js';
import {
  createRequirePermission,
  type FindActiveStaffGrant,
} from '../../common/middleware/authorize.js';
import { signAccessToken, verifyAccessToken } from '../../common/security/tokens.js';
import type { StaffRole } from '../../common/types/staff-roles.js';
import { env } from '../../config/env.js';
import { RIDER_DIRECTORY_PERMISSION } from './module.routes.js';
import {
  listAdminRidersQuerySchema,
  adminRiderIdParamSchema,
} from './module.schema.js';
import {
  RIDER_DIRECTORY_INCLUDES_EXACT_COORDINATES,
  RidersServiceImpl,
} from './module.service.js';
import type { RidersRepository } from './module.repository.js';

const tokenOptions = { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };

function staffToken(userId: string, staffRole: StaffRole, overrides: { mfa?: boolean } = {}) {
  return signAccessToken(
    {
      sub: userId,
      role: 'ADMIN',
      purpose: 'access',
      staffRole,
      mfa: overrides.mfa ?? true,
      mfaAt: Math.floor(Date.now() / 1000),
    },
    env.JWT_ACCESS_SECRET,
    600,
    tokenOptions,
  );
}

function grantFor(role: StaffRole, mfaEnabled = true): FindActiveStaffGrant {
  return async () => ({
    staffRole: role,
    userStatus: 'ACTIVE',
    mfaEnabled,
  });
}

function appWithPermission(permission: Permission, findGrant: FindActiveStaffGrant): Express {
  const app = express();
  app.get(
    '/probe',
    (req, _res, next) => {
      const header = req.header('authorization');
      const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
      if (!token) {
        next(
          new AppError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
          }),
        );
        return;
      }
      try {
        req.auth = verifyAccessToken(token, env.JWT_ACCESS_SECRET, tokenOptions);
        next();
      } catch (error) {
        next(error);
      }
    },
    createRequirePermission(permission, findGrant),
    (_req, res) => {
      res.status(200).json({ ok: true });
    },
  );
  app.use(errorHandler);
  return app;
}

function assertNoExactCoordinates(payload: unknown) {
  const json = JSON.stringify(payload);
  expect(json).not.toMatch(/latitude/i);
  expect(json).not.toMatch(/longitude/i);
  expect(json).not.toMatch(/"lat"/i);
  expect(json).not.toMatch(/"lng"/i);
  expect(json).not.toMatch(/ghanaCard/i);
  expect(json).not.toMatch(/mfa/i);
  expect(json).not.toMatch(/password/i);
  expect(json).not.toMatch(/secret/i);
  expect(json).not.toMatch(/refreshToken/i);
  expect(json).not.toMatch(/accessToken/i);
}

describe('rider directory authorization', () => {
  it('reuses ReviewRiders without broadening role grants', () => {
    expect(RIDER_DIRECTORY_PERMISSION).toBe(Permission.ReviewRiders);
    expect(staffRoleHasPermission('SUPER_ADMIN', RIDER_DIRECTORY_PERMISSION)).toBe(true);
    expect(staffRoleHasPermission('OPERATIONS_ADMIN', RIDER_DIRECTORY_PERMISSION)).toBe(true);
    expect(staffRoleHasPermission('FINANCE_ADMIN', RIDER_DIRECTORY_PERMISSION)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', RIDER_DIRECTORY_PERMISSION)).toBe(false);
    expect(RIDER_DIRECTORY_INCLUDES_EXACT_COORDINATES).toBe(false);
  });

  it('allows Ops with MFA and denies Support / Finance / missing MFA', async () => {
    const ops = appWithPermission(RIDER_DIRECTORY_PERMISSION, grantFor('OPERATIONS_ADMIN'));
    const support = appWithPermission(RIDER_DIRECTORY_PERMISSION, grantFor('SUPPORT_ADMIN'));
    const finance = appWithPermission(RIDER_DIRECTORY_PERMISSION, grantFor('FINANCE_ADMIN'));
    const noMfa = appWithPermission(RIDER_DIRECTORY_PERMISSION, grantFor('OPERATIONS_ADMIN', false));

    const opsToken = staffToken(randomUUID(), 'OPERATIONS_ADMIN');
    const supportToken = staffToken(randomUUID(), 'SUPPORT_ADMIN');
    const financeToken = staffToken(randomUUID(), 'FINANCE_ADMIN');
    const bareToken = staffToken(randomUUID(), 'OPERATIONS_ADMIN', { mfa: false });

    expect((await request(ops).get('/probe').set('Authorization', `Bearer ${opsToken}`)).status).toBe(
      200,
    );
    expect(
      (await request(support).get('/probe').set('Authorization', `Bearer ${supportToken}`)).status,
    ).toBe(403);
    expect(
      (await request(finance).get('/probe').set('Authorization', `Bearer ${financeToken}`)).status,
    ).toBe(403);
    expect(
      (await request(noMfa).get('/probe').set('Authorization', `Bearer ${bareToken}`)).status,
    ).toBe(403);
    expect((await request(ops).get('/probe')).status).toBe(401);
  });
});

describe('listAdminRidersQuerySchema', () => {
  it('applies pagination defaults and rejects unknown fields', () => {
    expect(listAdminRidersQuerySchema.parse({}).page).toBe(1);
    expect(listAdminRidersQuerySchema.parse({}).pageSize).toBe(20);
    expect(listAdminRidersQuerySchema.parse({ pageSize: '50' }).pageSize).toBe(50);
    expect(() => listAdminRidersQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => listAdminRidersQuerySchema.parse({ status: 'NOPE' })).toThrow();
    expect(() => listAdminRidersQuerySchema.parse({ extra: true })).toThrow();
  });

  it('accepts filters', () => {
    const parsed = listAdminRidersQuerySchema.parse({
      q: 'Kwame',
      status: 'ACTIVE',
      verificationStatus: 'APPROVED',
      availability: 'AVAILABLE',
    });
    expect(parsed.q).toBe('Kwame');
    expect(parsed.verificationStatus).toBe('APPROVED');
  });

  it('requires UUID rider id param', () => {
    expect(() => adminRiderIdParamSchema.parse({ riderId: 'not-a-uuid' })).toThrow();
    expect(adminRiderIdParamSchema.parse({ riderId: randomUUID() }).riderId).toBeTruthy();
  });
});

describe('RidersServiceImpl directory/profile', () => {
  const now = new Date('2026-11-12T12:00:00.000Z');

  it('paginates, searches, filters, and returns empty pages', async () => {
    const listForAdminDirectory = vi
      .fn()
      .mockResolvedValueOnce({
        total: 2,
        items: [
          {
            id: '11111111-1111-1111-1111-111111111111',
            phoneNumber: '+233244000001',
            role: 'RIDER',
            status: 'ACTIVE',
            displayName: null,
            createdAt: now,
            fullName: 'Ada Rider',
            verificationStatus: 'APPROVED',
            availability: 'AVAILABLE',
            submittedAt: now,
          },
        ],
      })
      .mockResolvedValueOnce({ total: 0, items: [] });

    const service = new RidersServiceImpl(
      { listForAdminDirectory } as unknown as RidersRepository,
      {
        storage: {} as never,
        audit: { record: vi.fn() } as never,
        now: () => now,
      },
    );

    const page = (await service.listRidersForAdmin({
      page: 1,
      pageSize: 20,
      q: 'Ada',
      status: 'ACTIVE',
      verificationStatus: 'APPROVED',
      availability: 'AVAILABLE',
    })) as {
      items: Array<{ id: string; availability: string }>;
      pagination: { total: number; hasNextPage: boolean };
      semantics: { availability: string };
    };

    expect(listForAdminDirectory).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      q: 'Ada',
      status: 'ACTIVE',
      verificationStatus: 'APPROVED',
      availability: 'AVAILABLE',
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.role).toBe('RIDER');
    expect(page.items[0]?.verificationStatus).toBe('APPROVED');
    expect(page.pagination.total).toBe(2);
    expect(page.semantics.availability).toBe('database_snapshot');
    assertNoExactCoordinates(page);

    const empty = (await service.listRidersForAdmin({ page: 1, pageSize: 20 })) as {
      items: unknown[];
      pagination: { total: number };
    };
    expect(empty.items).toEqual([]);
    expect(empty.pagination.total).toBe(0);
  });

  it('returns ops profile without coordinates or secrets', async () => {
    const riderId = '22222222-2222-2222-2222-222222222222';
    const findForAdminProfile = vi.fn(async () => ({
      id: riderId,
      phoneNumber: '+233244000002',
      role: 'RIDER',
      status: 'ACTIVE',
      displayName: 'Bo',
      createdAt: now,
      updatedAt: now,
      riderProfile: {
        fullName: 'Bo Rider',
        verificationStatus: 'APPROVED',
        availability: 'OFFLINE',
        submittedAt: now,
        driversLicenceNumber: 'DL-1',
        driversLicenceExpiry: now,
        verificationNotes: null,
        vehicles: [
          {
            id: randomUUID(),
            category: 'OKADA',
            registrationNumber: 'GR-1',
            make: 'TVS',
            model: 'X',
            colour: 'red',
            capacity: 1,
            verificationStatus: 'APPROVED',
            rejectionReason: null,
            submittedAt: now,
            reviewedAt: now,
          },
        ],
        location: {
          sharingEnabled: true,
          recordedAt: now,
          receivedAt: now,
        },
        wallet: { tokenBalance: 12 },
      },
    }));

    const service = new RidersServiceImpl(
      { findForAdminProfile } as unknown as RidersRepository,
      {
        storage: {} as never,
        audit: { record: vi.fn() } as never,
        now: () => now,
      },
    );

    const profile = (await service.getRiderForAdmin(riderId)) as {
      status: string;
      profile: { availability: string; verificationStatus: string };
      gps: { fresh: boolean; snapshot: boolean };
      tokens: { balance: number };
      privacy: { exactCoordinatesIncluded: boolean };
    };

    expect(profile.status).toBe('ACTIVE');
    expect(profile.profile.availability).toBe('OFFLINE');
    expect(profile.profile.verificationStatus).toBe('APPROVED');
    expect(profile.gps.snapshot).toBe(true);
    expect(profile.tokens.balance).toBe(12);
    expect(profile.privacy.exactCoordinatesIncluded).toBe(false);
    assertNoExactCoordinates(profile);
  });

  it('returns 404 for unknown rider', async () => {
    const service = new RidersServiceImpl(
      { findForAdminProfile: vi.fn(async () => null) } as unknown as RidersRepository,
      {
        storage: {} as never,
        audit: { record: vi.fn() } as never,
        now: () => now,
      },
    );
    await expect(service.getRiderForAdmin(randomUUID())).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });
});
