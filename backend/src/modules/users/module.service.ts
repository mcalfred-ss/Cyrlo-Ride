import { notImplemented } from '../../common/errors/not-implemented.js';
import type { UpdatePassengerProfileInput } from './module.schema.js';
import type { UsersRepository } from './module.repository.js';

export interface UsersService {
  getMe(): Promise<never>;
  updatePassengerProfile(input: UpdatePassengerProfileInput): Promise<never>;
}

export class UsersServiceImpl implements UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async getMe(): Promise<never> {
    notImplemented('getMe');
  }

  async updatePassengerProfile(_input: UpdatePassengerProfileInput): Promise<never> {
    notImplemented('updatePassengerProfile');
  }
}
