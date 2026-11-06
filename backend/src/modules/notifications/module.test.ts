import { describe, expect, it } from 'vitest';

import { NotificationsServiceImpl } from './module.service.js';

describe('notifications module', () => {
  it('does not implement listMine yet', async () => {
    const service = new NotificationsServiceImpl({} as never);
    await expect(service.listMine()).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
