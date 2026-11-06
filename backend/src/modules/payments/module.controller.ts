import type { PaymentsService } from './module.service.js';

export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}
}
