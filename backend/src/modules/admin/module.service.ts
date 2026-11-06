import { notImplemented } from '../../common/errors/not-implemented.js';
import type { ReviewRiderInput, SuspendUserInput } from './module.schema.js';
import type { AdminRepository } from './module.repository.js';

export interface AdminService {
  reviewRider(input: ReviewRiderInput): Promise<never>;
  suspendUser(input: SuspendUserInput): Promise<never>;
}

export class AdminServiceImpl implements AdminService {
  constructor(private readonly repository: AdminRepository) {}

  async reviewRider(_input: ReviewRiderInput): Promise<never> {
    notImplemented('reviewRider');
  }

  async suspendUser(_input: SuspendUserInput): Promise<never> {
    notImplemented('suspendUser');
  }
}
