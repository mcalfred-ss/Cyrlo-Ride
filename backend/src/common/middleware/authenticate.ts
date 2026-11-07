import type { RequestHandler } from 'express';

import { env } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { AppError } from '../errors/app-error.js';
import { verifyAccessToken } from '../security/tokens.js';
import type { UserRole } from '../types/roles.js';

const accessTokenOptions = {
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
};

export interface ActiveAccountRecord {
  id: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  role: UserRole;
}

/** Validates the Bearer access JWT and attaches claims to `req.auth`. */
export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
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
    req.auth = verifyAccessToken(
      header.slice('Bearer '.length).trim(),
      env.JWT_ACCESS_SECRET,
      accessTokenOptions,
    );
    next();
  } catch {
    next(
      new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Access token is invalid or expired',
      }),
    );
  }
};

/**
 * Loads the user row and rejects suspended or deleted accounts.
 * Keep authorization (roles/permissions) in `requireRole` / future RBAC.
 */
export function createRequireActiveAccount(
  findUser: (userId: string) => Promise<ActiveAccountRecord | null>,
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

    try {
      const user = await findUser(req.auth.sub);

      if (!user || user.status === 'DELETED') {
        next(
          new AppError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
          }),
        );
        return;
      }

      if (user.status === 'SUSPENDED') {
        next(
          new AppError({
            status: 403,
            code: 'FORBIDDEN',
            message: 'Account is suspended',
          }),
        );
        return;
      }

      if (user.role !== req.auth.role) {
        next(
          new AppError({
            status: 401,
            code: 'UNAUTHORIZED',
            message: 'Access token is invalid or expired',
          }),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const requireActiveAccount = createRequireActiveAccount(async (userId) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, role: true },
  });
  return user;
});

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
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
    if (!roles.includes(req.auth.role)) {
      next(
        new AppError({
          status: 403,
          code: 'FORBIDDEN',
          message: 'You do not have access to this resource',
        }),
      );
      return;
    }
    next();
  };
}
