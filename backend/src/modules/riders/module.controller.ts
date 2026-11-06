import type { RidersService } from './module.service.js';

export class RidersController {
  constructor(private readonly service: RidersService) {}
}
