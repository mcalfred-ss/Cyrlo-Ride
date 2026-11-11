import type { AuthRepository, AuthUser, IssuedRefreshSession } from './module.repository.js';

/** Persistence surface used by AuthServiceImpl (Prisma or in-memory for tests). */
export type AuthStore = Pick<
  AuthRepository,
  | 'createOtpChallenge'
  | 'findOpenLoginOtp'
  | 'verifyOtpAndCreateSession'
  | 'rotateRefreshSession'
  | 'revokeRefreshSession'
  | 'findUserById'
  | 'findUserByPhone'
  | 'createRefreshSessionForUser'
>;

export type { AuthUser, IssuedRefreshSession };
