import { Router } from 'express';

import type { UsersController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createUsersRouter(_controller: UsersController): Router {
  return Router();
}
