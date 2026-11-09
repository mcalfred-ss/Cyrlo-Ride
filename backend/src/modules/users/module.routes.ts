import { Router } from 'express';

import {
  authenticate,
  requireActiveAccount,
  requireRole,
} from '../../common/middleware/authenticate.js';
import { validate } from '../../common/middleware/validate.js';
import type { UsersController } from './module.controller.js';
import { updatePassengerProfileSchema } from './module.schema.js';

export function createUsersRouter(controller: UsersController): Router {
  const router = Router();
  router.get('/me', authenticate, requireActiveAccount, controller.getMe);
  router.patch(
    '/me',
    authenticate,
    requireActiveAccount,
    requireRole('PASSENGER'),
    validate({ body: updatePassengerProfileSchema }),
    controller.updateMe,
  );
  router.delete('/me', authenticate, requireActiveAccount, controller.deleteMe);
  return router;
}
