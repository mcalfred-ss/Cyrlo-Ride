import { notImplemented } from '../../common/errors/not-implemented.js';
import type { MarkReadInput } from './module.schema.js';
import type { NotificationsRepository } from './module.repository.js';

export interface NotificationsService {
  listMine(): Promise<never>;
  markRead(input: MarkReadInput): Promise<never>;
}

export class NotificationsServiceImpl implements NotificationsService {
  constructor(private readonly repository: NotificationsRepository) {}

  async listMine(): Promise<never> {
    notImplemented('listMine');
  }

  async markRead(_input: MarkReadInput): Promise<never> {
    notImplemented('markRead');
  }
}
