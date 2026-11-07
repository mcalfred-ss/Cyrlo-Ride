import type { RecordAuditInput } from './module.schema.js';
import type { AuditRepository } from './module.repository.js';

export interface AuditService {
  record(input: RecordAuditInput): Promise<{ id: string }>;
}

export class AuditServiceImpl implements AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(input: RecordAuditInput): Promise<{ id: string }> {
    return this.repository.create(input);
  }
}

/** In-memory audit sink for unit tests. */
export class MemoryAuditService implements AuditService {
  readonly entries: RecordAuditInput[] = [];

  async record(input: RecordAuditInput): Promise<{ id: string }> {
    this.entries.push(structuredClone(input));
    return { id: `audit-${this.entries.length}` };
  }
}
