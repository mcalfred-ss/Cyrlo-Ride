import type { RequestHandler } from 'express';

import { Permission, staffRoleHasPermission } from '../authz/permissions.js';
import { env } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../errors/app-error.js';
import type { StaffRole } from '../types/staff-roles.js';

export interface StaffContext {
  userId: string;
  staffRole: StaffRole;
  mfaAt?: number;
}

declare global {
  namespace Express {
    interface Request {
      staff?: StaffContext;
    }
  }
}

export type FindActiveStaffGrant = (userId: string) => Promise<{
  staffRole: StaffRole;
  userStatus: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  mfaEnabled: boolean;
} | null>;

export const defaultFindActiveStaffGrant: FindActiveStaffGrant = async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      status: true,
      role: true,
      adminRoleGrants: {
        where: { revokedAt: null },
        orderBy: { grantedAt: 'desc' },
        take: 1,
        select: { staffRole: true },
      },
      adminMfaCredential: { select: { enabledAt: true } },
    },
  });
  if (!user || user.role !== 'ADMIN') return null;
  const grant = user.adminRoleGrants[0];
  if (!grant) return null;
  return {
    staffRole: grant.staffRole,
    userStatus: user.status,
    mfaEnabled: Boolean(user.adminMfaCredential?.enabledAt),
  };
};

/**
 * Requires an MFA-verified staff access token and a live DB grant with the permission.
 * Does not trust client-supplied staffRole claims as authorization.
 */
export function createRequirePermission(
  permission: Permission,
  findGrant: FindActiveStaffGrant = defaultFindActiveStaffGrant,
): RequestHandler {
  return async (req, _res, next) => {
    if (!req.auth) {
      next(
        new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication is required',
        }),
      );
      return;
    }

    if (req.auth.role !== 'ADMIN' || req.auth.purpose !== 'access' || req.auth.mfa !== true) {
      next(
        new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Administrator MFA session is required',
        }),
      );
      return;
    }

    try {
      const grant = await findGrant(req.auth.sub);
      if (!grant || grant.userStatus === 'DELETED') {
        next(
          new AppError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
          }),
        );
        return;
      }
      if (grant.userStatus === 'SUSPENDED') {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Account is suspended',
          }),
        );
        return;
      }
      if (!grant.mfaEnabled) {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Administrator MFA enrollment is required',
          }),
        );
        return;
      }
      if (!staffRoleHasPermission(grant.staffRole, permission)) {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'You do not have access to this resource',
          }),
        );
        return;
      }

      req.staff = {
        userId: req.auth.sub,
        staffRole: grant.staffRole,
        mfaAt: req.auth.mfaAt,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return createRequirePermission(permission);
}

/** MFA staff session with any one of the listed permissions. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  if (permissions.length === 0) {
    throw new Error('requireAnyPermission needs at least one permission');
  }
  return async (req, _res, next) => {
    if (!req.auth) {
      next(
        new AppError({
          status: 401,
          code: 'UNAUTHORIZED',
          message: 'Authentication is required',
        }),
      );
      return;
    }
    if (req.auth.role !== 'ADMIN' || req.auth.purpose !== 'access' || req.auth.mfa !== true) {
      next(
        new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Administrator MFA session is required',
        }),
      );
      return;
    }
    try {
      const grant = await defaultFindActiveStaffGrant(req.auth.sub);
      if (!grant || grant.userStatus === 'DELETED') {
        next(
          new AppError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
          }),
        );
        return;
      }
      if (grant.userStatus === 'SUSPENDED') {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Account is suspended',
          }),
        );
        return;
      }
      if (!grant.mfaEnabled) {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Administrator MFA enrollment is required',
          }),
        );
        return;
      }
      const allowed = permissions.some((permission) =>
        staffRoleHasPermission(grant.staffRole, permission),
      );
      if (!allowed) {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'You do not have access to this resource',
          }),
        );
        return;
      }
      req.staff = {
        userId: req.auth.sub,
        staffRole: grant.staffRole,
        mfaAt: req.auth.mfaAt,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** For especially sensitive actions: MFA verified within ADMIN_RECENT_MFA_SECONDS. */
export function requireRecentMfa(
  maxAgeSeconds = env.ADMIN_RECENT_MFA_SECONDS,
): RequestHandler {
  return (req, _res, next) => {
    const mfaAt = req.auth?.mfaAt ?? req.staff?.mfaAt;
    if (typeof mfaAt !== 'number') {
      next(
        new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Recent MFA verification is required',
        }),
      );
      return;
    }
    const age = Math.floor(Date.now() / 1000) - mfaAt;
    if (age < 0 || age > maxAgeSeconds) {
      next(
        new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'Recent MFA verification is required',
        }),
      );
      return;
    }
    next();
  };
}
