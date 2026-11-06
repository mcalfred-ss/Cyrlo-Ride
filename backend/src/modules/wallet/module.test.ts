import { describe, expect, it } from 'vitest';

import { WalletServiceImpl } from './module.service.js';

describe('wallet module', () => {
  it('does not implement getBalance yet', async () => {
    const service = new WalletServiceImpl({} as never);
    await expect(service.getBalance()).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
