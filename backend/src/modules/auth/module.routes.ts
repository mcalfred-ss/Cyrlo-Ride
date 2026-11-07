import { Router } from 'express';

import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import { otpRateLimiter } from '../../common/middleware/rate-limit.js';
import { validate } from '../../common/middleware/validate.js';
import type { AuthController } from './module.controller.js';
import {
  logoutSchema,
  refreshSessionSchema,
  requestOtpSchema,
  verifyOtpSchema,
} from './module.schema.js';

export function createAuthRouter(controller: AuthController): Router {
  const router = Router();

  router.post(
    '/otp',
    otpRateLimiter,
    validate({ body: requestOtpSchema }),
    controller.requestOtp,
  );

  router.post(
    '/otp/verify',
    otpRateLimiter,
    validate({ body: verifyOtpSchema }),
    controller.verifyOtp,
  );

  router.post('/refresh', validate({ body: refreshSessionSchema }), controller.refresh);

  router.post(
    '/logout',
    authenticate,
    requireActiveAccount,
    validate({ body: logoutSchema }),
    controller.logout,
  );

  return router;
}
