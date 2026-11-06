import { notImplemented } from '../../common/errors/not-implemented.js';
import type { RecordAuditInput } from './module.schema.js';
import type { AuditRepository } from './module.repository.js';

export interface AuditService {
  record(input: RecordAuditInput): Promise<never>;
}

export class AuditServiceImpl implements AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(_input: RecordAuditInput): Promise<never> {
    notImplemented('record');
  }
}
