import { Router } from 'express';

import type { NotificationsController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createNotificationsRouter(_controller: NotificationsController): Router {
  return Router();
}
