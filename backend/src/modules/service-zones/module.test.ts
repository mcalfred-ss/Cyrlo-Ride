import { describe, expect, it } from 'vitest';

import { ServiceZonesServiceImpl } from './module.service.js';

describe('service-zones module', () => {
  it('does not implement assertPickupSupported yet', async () => {
    const service = new ServiceZonesServiceImpl({} as never);
    await expect(service.assertPickupSupported({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
