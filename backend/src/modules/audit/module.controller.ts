import type { AuditService } from './module.service.js';

export class AuditController {
  constructor(private readonly service: AuditService) {}
}
