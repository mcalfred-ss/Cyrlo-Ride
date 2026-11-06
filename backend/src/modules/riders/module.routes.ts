import { Router } from 'express';

import type { RidersController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createRidersRouter(_controller: RidersController): Router {
  return Router();
}
