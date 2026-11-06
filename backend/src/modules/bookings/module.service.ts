import { notImplemented } from '../../common/errors/not-implemented.js';
import type { CreateBookingInput, BookingIdInput, CancelBookingInput } from './module.schema.js';
import type { BookingsRepository } from './module.repository.js';

export interface BookingsService {
  createRequest(input: CreateBookingInput): Promise<never>;
  cancel(input: CancelBookingInput): Promise<never>;
  complete(input: BookingIdInput): Promise<never>;
}

export class BookingsServiceImpl implements BookingsService {
  constructor(private readonly repository: BookingsRepository) {}

  async createRequest(_input: CreateBookingInput): Promise<never> {
    notImplemented('createRequest');
  }

  async cancel(_input: CancelBookingInput): Promise<never> {
    notImplemented('cancel');
  }

  async complete(_input: BookingIdInput): Promise<never> {
    notImplemented('complete');
  }
}
