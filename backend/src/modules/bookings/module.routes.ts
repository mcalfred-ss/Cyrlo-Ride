import { Router } from 'express';

import type { BookingsController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createBookingsRouter(_controller: BookingsController): Router {
  return Router();
}
