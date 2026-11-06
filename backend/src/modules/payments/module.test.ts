import { describe, expect, it } from 'vitest';

import { PaymentsServiceImpl } from './module.service.js';

describe('payments module', () => {
  it('does not implement initiateBookingFee yet', async () => {
    const service = new PaymentsServiceImpl({} as never);
    await expect(service.initiateBookingFee({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
