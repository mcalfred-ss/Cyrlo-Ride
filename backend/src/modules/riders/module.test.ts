import { describe, expect, it } from 'vitest';

import { RidersServiceImpl } from './module.service.js';

describe('riders module', () => {
  it('does not implement submitOnboarding yet', async () => {
    const service = new RidersServiceImpl({} as never);
    await expect(service.submitOnboarding({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
