import type { UsersService } from './module.service.js';

export class UsersController {
  constructor(private readonly service: UsersService) {}
}
