import { Router } from 'express';

import type { AuditController } from './module.controller.js';

/**
 * Read APIs for audit logs live under `/admin/audit-logs` (ManageAdmins).
 * This mount stays empty so audit records remain immutable via ordinary HTTP.
 */
export function createAuditRouter(_controller: AuditController): Router {
  return Router();
}
