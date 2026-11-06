export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_IMPLEMENTED'
  | 'PAYMENT_VERIFICATION_FAILED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(options: { status: number; code: ErrorCode; message: string; details?: unknown }) {
    super(options.message);
    this.name = 'AppError';
    this.status = options.status;
    this.code = options.code;
    if (options.details !== undefined) {
      this.details = options.details;
    }
  }
}
