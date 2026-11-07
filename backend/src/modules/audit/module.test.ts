import { describe, expect, it } from 'vitest';

import { MemoryAuditService } from './module.service.js';

describe('audit module', () => {
  it('records actor, action, entity and metadata without secrets', async () => {
    const audit = new MemoryAuditService();
    const result = await audit.record({
      actorId: '11111111-1111-1111-1111-111111111111',
      action: 'admin.bootstrap.completed',
      entityType: 'user',
      entityId: '11111111-1111-1111-1111-111111111111',
      metadata: { staffRole: 'SUPER_ADMIN' },
    });
    expect(result.id).toBeTruthy();
    expect(audit.entries[0]?.action).toBe('admin.bootstrap.completed');
    expect(JSON.stringify(audit.entries[0])).not.toMatch(/secret|otp|recovery/i);
  });
});
