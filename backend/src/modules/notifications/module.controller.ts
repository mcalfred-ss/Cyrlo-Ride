import type { NotificationsService } from './module.service.js';

export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}
}
