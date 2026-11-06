import { describe, expect, it } from 'vitest';

import { LocationsServiceImpl } from './module.service.js';

describe('locations module', () => {
  it('does not implement updateOwnLocation yet', async () => {
    const service = new LocationsServiceImpl({} as never);
    await expect(service.updateOwnLocation({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
