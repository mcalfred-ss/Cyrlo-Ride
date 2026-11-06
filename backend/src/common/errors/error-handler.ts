import type { ErrorRequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { logger } from '../../config/logger.js';
import { AppError, type ErrorCode } from './app-error.js';

function errorBody(options: {
  code: ErrorCode;
  message: string;
  requestId?: string;
  details?: unknown;
}): { success: false; error: Record<string, unknown> } {
  return {
    success: false,
    error: {
      code: options.code,
      message: options.message,
      ...(options.details !== undefined ? { details: options.details } : {}),
      ...(options.requestId ? { requestId: options.requestId } : {}),
    },
  };
}

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return;

  const requestId = req.requestId;

  if (error instanceof ZodError) {
    res.status(400).json(
      errorBody({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        requestId,
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }),
    );
    return;
  }

  if (error instanceof AppError) {
    if (error.status >= 500) {
      logger.error({ err: error, requestId }, error.message);
    }
    res.status(error.status).json(
      errorBody({
        code: error.code,
        message: error.message,
        requestId,
        details: error.details,
      }),
    );
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    res.status(409).json(
      errorBody({
        code: 'CONFLICT',
        message: 'The request conflicts with existing data',
        requestId,
      }),
    );
    return;
  }

  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P1001')
  ) {
    logger.error({ err: error, requestId }, 'database unavailable');
    res.status(503).json(
      errorBody({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database is unavailable',
        requestId,
      }),
    );
    return;
  }

  logger.error({ err: error, requestId }, 'unhandled error');
  res.status(500).json(
    errorBody({
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      requestId,
    }),
  );
};
