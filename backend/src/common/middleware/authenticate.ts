import type { RequestHandler } from 'express';

import { env } from '../../config/env.js';
import { AppError } from '../errors/app-error.js';
import { verifyAccessToken } from '../security/tokens.js';
import type { UserRole } from '../types/roles.js';

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
    req.auth = verifyAccessToken(header.slice('Bearer '.length).trim(), env.JWT_ACCESS_SECRET);
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
