import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { Permission, staffRoleHasPermission } from '../../common/authz/permissions.js';
import { errorHandler } from '../../common/errors/error-handler.js';
import {
  createRequirePermission,
  type FindActiveStaffGrant,
} from '../../common/middleware/authorize.js';
import { signAccessToken, verifyAccessToken } from '../../common/security/tokens.js';
import type { StaffRole } from '../../common/types/staff-roles.js';
import { env } from '../../config/env.js';
import { PASSENGER_DIRECTORY_PERMISSION } from './module.routes.js';

const tokenOptions = { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE };

function staffToken(userId: string, staffRole: StaffRole) {
  return signAccessToken(
    {
      sub: userId,
      role: 'ADMIN',
      purpose: 'access',
      staffRole,
      mfa: true,
      mfaAt: Math.floor(Date.now() / 1000),
    },
    env.JWT_ACCESS_SECRET,
    600,
    tokenOptions,
  );
}

function grantFor(role: StaffRole): FindActiveStaffGrant {
  return async () => ({
    staffRole: role,
    userStatus: 'ACTIVE',
    mfaEnabled: true,
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
        next(Object.assign(new Error('UNAUTHORIZED'), { status: 401, code: 'UNAUTHORIZED' }));
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

describe('passenger directory permission (S1)', () => {
  it('uses ViewBookingHistory as the sole directory permission', () => {
    expect(PASSENGER_DIRECTORY_PERMISSION).toBe(Permission.ViewBookingHistory);
  });

  it('allows roles with ViewBookingHistory to pass the directory gate', async () => {
    const app = appWithPermission(
      PASSENGER_DIRECTORY_PERMISSION,
      grantFor('SUPPORT_ADMIN'),
    );
    const token = staffToken('11111111-1111-1111-1111-111111111111', 'SUPPORT_ADMIN');
    expect((await request(app).get('/probe').set('Authorization', `Bearer ${token}`)).status).toBe(
      200,
    );

    const opsApp = appWithPermission(
      PASSENGER_DIRECTORY_PERMISSION,
      grantFor('OPERATIONS_ADMIN'),
    );
    const opsToken = staffToken('22222222-2222-2222-2222-222222222222', 'OPERATIONS_ADMIN');
    expect(
      (await request(opsApp).get('/probe').set('Authorization', `Bearer ${opsToken}`)).status,
    ).toBe(200);
  });

  it('denies Finance (no ViewBookingHistory) on the directory gate', async () => {
    const app = appWithPermission(PASSENGER_DIRECTORY_PERMISSION, grantFor('FINANCE_ADMIN'));
    const token = staffToken('33333333-3333-3333-3333-333333333333', 'FINANCE_ADMIN');
    expect((await request(app).get('/probe').set('Authorization', `Bearer ${token}`)).status).toBe(
      403,
    );
  });

  it('does not treat SuspendReinstateRiders as sufficient for directory access', async () => {
    // Support has ViewBookingHistory but not Suspend — directory must still allow Support.
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.SuspendReinstateRiders)).toBe(false);
    expect(staffRoleHasPermission('SUPPORT_ADMIN', Permission.ViewBookingHistory)).toBe(true);

    // Suspend-only is not a catalog role; prove Suspend is not the directory gate:
    // a Suspend probe allows Ops, but directory gate is ViewBookingHistory (Support passes
    // directory while failing Suspend).
    const suspendApp = appWithPermission(
      Permission.SuspendReinstateRiders,
      grantFor('SUPPORT_ADMIN'),
    );
    const directoryApp = appWithPermission(
      PASSENGER_DIRECTORY_PERMISSION,
      grantFor('SUPPORT_ADMIN'),
    );
    const token = staffToken('44444444-4444-4444-4444-444444444444', 'SUPPORT_ADMIN');
    expect(
      (await request(suspendApp).get('/probe').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);
    expect(
      (await request(directoryApp).get('/probe').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(200);

    // Catalog roles: directory access equals ViewBookingHistory, not Suspend.
    for (const role of [
      'SUPER_ADMIN',
      'OPERATIONS_ADMIN',
      'FINANCE_ADMIN',
      'SUPPORT_ADMIN',
    ] as const) {
      const directory = staffRoleHasPermission(role, Permission.ViewBookingHistory);
      const suspend = staffRoleHasPermission(role, Permission.SuspendReinstateRiders);
      expect(staffRoleHasPermission(role, PASSENGER_DIRECTORY_PERMISSION)).toBe(directory);
      // If Suspend were still an alternate gate, Support would need Suspend — they do not.
      if (role === 'SUPPORT_ADMIN') {
        expect(directory && !suspend).toBe(true);
      }
    }
  });
});

describe('phase 0 permission probes (ledgers, reports, audit, bookings)', () => {
  it('allows Ops ViewBookingHistory and denies Finance', async () => {
    const ops = appWithPermission(Permission.ViewBookingHistory, grantFor('OPERATIONS_ADMIN'));
    const finance = appWithPermission(Permission.ViewBookingHistory, grantFor('FINANCE_ADMIN'));
    const opsToken = staffToken('55555555-5555-5555-5555-555555555555', 'OPERATIONS_ADMIN');
    const financeToken = staffToken('66666666-6666-6666-6666-666666666666', 'FINANCE_ADMIN');

    expect((await request(ops).get('/probe').set('Authorization', `Bearer ${opsToken}`)).status).toBe(
      200,
    );
    expect(
      (await request(finance).get('/probe').set('Authorization', `Bearer ${financeToken}`)).status,
    ).toBe(403);
  });

  it('allows Finance ViewTokenLedgers and ViewFinancialReports; denies Support', async () => {
    const ledgers = appWithPermission(Permission.ViewTokenLedgers, grantFor('FINANCE_ADMIN'));
    const reports = appWithPermission(Permission.ViewFinancialReports, grantFor('FINANCE_ADMIN'));
    const supportLedgers = appWithPermission(Permission.ViewTokenLedgers, grantFor('SUPPORT_ADMIN'));
    const token = staffToken('77777777-7777-7777-7777-777777777777', 'FINANCE_ADMIN');
    const supportToken = staffToken('88888888-8888-8888-8888-888888888888', 'SUPPORT_ADMIN');

    expect((await request(ledgers).get('/probe').set('Authorization', `Bearer ${token}`)).status).toBe(
      200,
    );
    expect((await request(reports).get('/probe').set('Authorization', `Bearer ${token}`)).status).toBe(
      200,
    );
    expect(
      (await request(supportLedgers).get('/probe').set('Authorization', `Bearer ${supportToken}`))
        .status,
    ).toBe(403);
  });

  it('allows Super ManageAdmins for audit logs; denies Ops', async () => {
    const superApp = appWithPermission(Permission.ManageAdmins, grantFor('SUPER_ADMIN'));
    const opsApp = appWithPermission(Permission.ManageAdmins, grantFor('OPERATIONS_ADMIN'));
    const superToken = staffToken('99999999-9999-9999-9999-999999999999', 'SUPER_ADMIN');
    const opsToken = staffToken('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'OPERATIONS_ADMIN');

    expect(
      (await request(superApp).get('/probe').set('Authorization', `Bearer ${superToken}`)).status,
    ).toBe(200);
    expect((await request(opsApp).get('/probe').set('Authorization', `Bearer ${opsToken}`)).status).toBe(
      403,
    );
  });
});
