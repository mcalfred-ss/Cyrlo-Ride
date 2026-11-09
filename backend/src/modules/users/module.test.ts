import { describe, expect, it, vi } from 'vitest';

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
        passengerProfile: {
          fullName: null,
          dateOfBirth: null,
          gender: null,
          homeLocation: null,
          homeLatitude: null,
          homeLongitude: null,
        },
        riderProfile: null,
      }),
    } as never);

    await expect(service.getMe('11111111-1111-1111-1111-111111111111')).resolves.toMatchObject({
      phoneNumber: '+233244123456',
      role: 'PASSENGER',
      passengerProfile: {
        fullName: null,
        dateOfBirth: null,
        gender: null,
        homeLocation: null,
      },
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

  it('upserts passenger profile details', async () => {
    const upsertPassengerProfile = vi.fn(async () => ({
      fullName: 'Ama Mensah',
      dateOfBirth: new Date('2000-05-01T00:00:00.000Z'),
      gender: 'FEMALE' as const,
      homeLocation: 'Kokobin',
      homeLatitude: { toString: () => '6.650000' },
      homeLongitude: { toString: () => '-1.620000' },
    }));

    const service = new UsersServiceImpl({
      findRole: async () => 'PASSENGER',
      upsertPassengerProfile,
    } as never);

    await expect(
      service.updatePassengerProfile('11111111-1111-1111-1111-111111111111', {
        fullName: 'Ama Mensah',
        dateOfBirth: '2000-05-01',
        gender: 'FEMALE',
        homeLocation: 'Kokobin',
        homeLatitude: 6.65,
        homeLongitude: -1.62,
      }),
    ).resolves.toMatchObject({
      fullName: 'Ama Mensah',
      dateOfBirth: '2000-05-01',
      gender: 'FEMALE',
      homeLocation: 'Kokobin',
      homeLatitude: 6.65,
      homeLongitude: -1.62,
    });

    expect(upsertPassengerProfile).toHaveBeenCalledOnce();
  });

  it('rejects rider accounts from passenger profile update', async () => {
    const service = new UsersServiceImpl({
      findRole: async () => 'RIDER',
    } as never);

    await expect(
      service.updatePassengerProfile('11111111-1111-1111-1111-111111111111', {
        fullName: 'Kwame',
        dateOfBirth: '1998-01-01',
        gender: 'MALE',
        homeLocation: 'Kokobin',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
