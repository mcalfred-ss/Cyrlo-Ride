import { Router } from 'express';

import type { LocationsController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createLocationsRouter(_controller: LocationsController): Router {
  return Router();
}
