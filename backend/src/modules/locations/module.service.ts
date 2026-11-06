import { notImplemented } from '../../common/errors/not-implemented.js';
import type { UpdateLocationInput } from './module.schema.js';
import type { LocationsRepository } from './module.repository.js';

export interface LocationsService {
  updateOwnLocation(input: UpdateLocationInput): Promise<never>;
  stopSharing(): Promise<never>;
}

export class LocationsServiceImpl implements LocationsService {
  constructor(private readonly repository: LocationsRepository) {}

  async updateOwnLocation(_input: UpdateLocationInput): Promise<never> {
    notImplemented('updateOwnLocation');
  }

  async stopSharing(): Promise<never> {
    notImplemented('stopSharing');
  }
}
