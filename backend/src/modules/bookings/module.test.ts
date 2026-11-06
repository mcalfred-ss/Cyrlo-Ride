import { describe, expect, it } from 'vitest';

import { BookingsServiceImpl } from './module.service.js';

describe('bookings module', () => {
  it('does not implement createRequest yet', async () => {
    const service = new BookingsServiceImpl({} as never);
    await expect(service.createRequest({} as never)).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });
});
