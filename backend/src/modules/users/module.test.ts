import { describe, expect, it } from 'vitest';

import { UsersServiceImpl } from './module.service.js';

describe('users module', () => {
  it('returns the authenticated user profile', async () => {
    const service = new UsersServiceImpl({
      findMe: async () => ({
        id: '11111111-1111-1111-1111-111111111111',
        phoneNumber: '+233244123456',
        role: 'PASSENGER',
        status: 'ACTIVE',
        displayName: null,
        passengerProfile: { fullName: null },
        riderProfile: null,
      }),
    } as never);

    await expect(service.getMe('11111111-1111-1111-1111-111111111111')).resolves.toMatchObject({
      phoneNumber: '+233244123456',
      role: 'PASSENGER',
      passengerProfile: { fullName: null },
      riderProfile: null,
    });
  });

  it('rejects suspended accounts', async () => {
    const service = new UsersServiceImpl({
      findMe: async () => ({
        id: '11111111-1111-1111-1111-111111111111',
        phoneNumber: '+233244123456',
        role: 'PASSENGER',
        status: 'SUSPENDED',
        displayName: null,
        passengerProfile: null,
        riderProfile: null,
      }),
    } as never);

    await expect(service.getMe('11111111-1111-1111-1111-111111111111')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
