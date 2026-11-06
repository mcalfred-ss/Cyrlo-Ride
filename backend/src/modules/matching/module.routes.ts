import { Router } from 'express';

import type { MatchingController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createMatchingRouter(_controller: MatchingController): Router {
  return Router();
}
