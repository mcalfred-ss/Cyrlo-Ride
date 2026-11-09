import { Router } from 'express';

import { authenticate, requireActiveAccount } from '../../common/middleware/authenticate.js';
import type { UsersController } from './module.controller.js';

export function createUsersRouter(controller: UsersController): Router {
  const router = Router();
  router.get('/me', authenticate, requireActiveAccount, controller.getMe);
  router.delete('/me', authenticate, requireActiveAccount, controller.deleteMe);
  return router;
}
