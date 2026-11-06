import { Router } from 'express';

import type { AuthController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createAuthRouter(_controller: AuthController): Router {
  return Router();
}
