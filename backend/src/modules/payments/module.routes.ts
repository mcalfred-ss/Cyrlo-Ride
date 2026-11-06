import { Router } from 'express';

import type { PaymentsController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createPaymentsRouter(_controller: PaymentsController): Router {
  return Router();
}
