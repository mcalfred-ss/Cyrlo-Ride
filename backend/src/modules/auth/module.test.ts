import { describe, expect, it } from 'vitest';

import { AuthServiceImpl } from './module.service.js';

describe('auth module', () => {
  it('does not implement requestOtp yet', async () => {
    const service = new AuthServiceImpl({} as never);
    await expect(service.requestOtp({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
