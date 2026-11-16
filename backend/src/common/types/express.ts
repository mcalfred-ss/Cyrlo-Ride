import type { AccessTokenClaims } from '../security/tokens.js';

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      requestId?: string;
      auth?: AccessTokenClaims;
      /** Investor Demo Mode — set by attachDemoFlag when DEMO_MODE + header. */
      demo?: boolean;
    }
  }
}

export {};
