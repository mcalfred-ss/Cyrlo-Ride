import { describe, expect, it } from 'vitest';

import { MatchingServiceImpl } from './module.service.js';

describe('matching module', () => {
  it('does not implement acceptOffer yet', async () => {
    const service = new MatchingServiceImpl({} as never);
    await expect(service.acceptOffer({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
