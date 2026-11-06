import { Router } from 'express';

import type { ServiceZonesController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createServiceZonesRouter(_controller: ServiceZonesController): Router {
  return Router();
}
