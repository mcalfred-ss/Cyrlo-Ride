import { describe, expect, it } from 'vitest';

import { AdminServiceImpl } from './module.service.js';

describe('admin module', () => {
  it('does not implement reviewRider yet', async () => {
    const service = new AdminServiceImpl({} as never);
    await expect(service.reviewRider({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
