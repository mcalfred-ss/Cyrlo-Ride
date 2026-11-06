import type { AccessTokenClaims } from '../security/tokens.js';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      requestId?: string;
      auth?: AccessTokenClaims;
    }
  }
}

export {};
