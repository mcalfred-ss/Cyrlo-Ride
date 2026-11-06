import { Router } from 'express';

import type { AuditController } from './module.controller.js';

/** Planned HTTP routes stay unregistered until the feature is implemented. */
export function createAuditRouter(_controller: AuditController): Router {
  return Router();
}
