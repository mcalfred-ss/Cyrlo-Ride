import type { BookingsService } from './module.service.js';

export class BookingsController {
  constructor(private readonly service: BookingsService) {}
}
