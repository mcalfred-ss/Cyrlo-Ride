import { describe, expect, it } from 'vitest';

import { UsersServiceImpl } from './module.service.js';

describe('users module', () => {
  it('does not implement getMe yet', async () => {
    const service = new UsersServiceImpl({} as never);
    await expect(service.getMe()).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
