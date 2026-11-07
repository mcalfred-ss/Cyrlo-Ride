import { AppError } from '../../common/errors/app-error.js';
import { notImplemented } from '../../common/errors/not-implemented.js';
import type { UpdatePassengerProfileInput } from './module.schema.js';
import type { UsersRepository } from './module.repository.js';

export interface UsersService {
  getMe(userId: string): Promise<{
    id: string;
    phoneNumber: string;
    role: string;
    status: string;
    displayName: string | null;
    passengerProfile: { fullName: string | null } | null;
    riderProfile: {
      fullName: string;
      verificationStatus: string;
      availability: string;
      vehicleRegistration: string | null;
      vehicleDescription: string | null;
    } | null;
  }>;
  updatePassengerProfile(input: UpdatePassengerProfileInput): Promise<never>;
}

export class UsersServiceImpl implements UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async getMe(userId: string) {
    const user = await this.repository.findMe(userId);
    if (!user || user.status === 'DELETED') {
      throw new AppError({
        status: 401,
        code: 'UNAUTHORIZED',
        message: 'Authentication is required',
      });
    }
    if (user.status === 'SUSPENDED') {
      throw new AppError({
        status: 403,
        code: 'FORBIDDEN',
        message: 'Account is suspended',
      });
    }

    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      status: user.status,
      displayName: user.displayName,
      passengerProfile: user.role === 'PASSENGER' ? user.passengerProfile : null,
      riderProfile: user.role === 'RIDER' ? user.riderProfile : null,
    };
  }

  async updatePassengerProfile(_input: UpdatePassengerProfileInput): Promise<never> {
    notImplemented('updatePassengerProfile');
  }
}
