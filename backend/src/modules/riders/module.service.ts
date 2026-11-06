import { notImplemented } from '../../common/errors/not-implemented.js';
import type { SubmitRiderOnboardingInput, UpdateAvailabilityInput } from './module.schema.js';
import type { RidersRepository } from './module.repository.js';

export interface RidersService {
  submitOnboarding(input: SubmitRiderOnboardingInput): Promise<never>;
  setAvailability(input: UpdateAvailabilityInput): Promise<never>;
}

export class RidersServiceImpl implements RidersService {
  constructor(private readonly repository: RidersRepository) {}

  async submitOnboarding(_input: SubmitRiderOnboardingInput): Promise<never> {
    notImplemented('submitOnboarding');
  }

  async setAvailability(_input: UpdateAvailabilityInput): Promise<never> {
    notImplemented('setAvailability');
  }
}
