import { describe, expect, it } from 'vitest';

import { AuditServiceImpl } from './module.service.js';

describe('audit module', () => {
  it('does not implement record yet', async () => {
    const service = new AuditServiceImpl({} as never);
    await expect(service.record({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
