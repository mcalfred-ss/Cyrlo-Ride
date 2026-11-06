import type { AuthService } from './module.service.js';

export class AuthController {
  constructor(private readonly service: AuthService) {}
}
