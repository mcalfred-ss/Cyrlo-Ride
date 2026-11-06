import { notImplemented } from '../../common/errors/not-implemented.js';
import type { AssertPickupInput } from './module.schema.js';
import type { ServiceZonesRepository } from './module.repository.js';

export interface ServiceZonesService {
  assertPickupSupported(input: AssertPickupInput): Promise<never>;
}

export class ServiceZonesServiceImpl implements ServiceZonesService {
  constructor(private readonly repository: ServiceZonesRepository) {}

  async assertPickupSupported(_input: AssertPickupInput): Promise<never> {
    notImplemented('assertPickupSupported');
  }
}
