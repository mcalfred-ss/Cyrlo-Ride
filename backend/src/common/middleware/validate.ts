import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

import { AppError } from '../errors/app-error.js';

export function validate(schemas: {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}): RequestHandler {
  return (req, res, next) => {
    const details: { path: string; message: string }[] = [];
    const validated: { body?: unknown; query?: unknown; params?: unknown } = {};

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) validated.body = result.data;
      else {
        details.push(
          ...result.error.issues.map((issue) => ({
            path: `body.${issue.path.join('.')}`,
            message: issue.message,
          })),
        );
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) validated.query = result.data;
      else {
        details.push(
          ...result.error.issues.map((issue) => ({
            path: `query.${issue.path.join('.')}`,
            message: issue.message,
          })),
        );
      }
    }

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) validated.params = result.data;
      else {
        details.push(
          ...result.error.issues.map((issue) => ({
            path: `params.${issue.path.join('.')}`,
            message: issue.message,
          })),
        );
      }
    }

    if (details.length > 0) {
      next(
        new AppError({
          status: 400,
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details,
        }),
      );
      return;
    }

    res.locals.validated = validated;
    next();
  };
}
