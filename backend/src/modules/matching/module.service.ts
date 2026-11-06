import { notImplemented } from '../../common/errors/not-implemented.js';
import type { OfferResponseInput } from './module.schema.js';
import type { MatchingRepository } from './module.repository.js';

export interface MatchingService {
  acceptOffer(input: OfferResponseInput): Promise<never>;
  rejectOffer(input: OfferResponseInput): Promise<never>;
}

export class MatchingServiceImpl implements MatchingService {
  constructor(private readonly repository: MatchingRepository) {}

  async acceptOffer(_input: OfferResponseInput): Promise<never> {
    notImplemented('acceptOffer');
  }

  async rejectOffer(_input: OfferResponseInput): Promise<never> {
    notImplemented('rejectOffer');
  }
}
