import { Router } from 'express';

import type { AdminController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createAdminRouter(_controller: AdminController): Router {
  return Router();
}
